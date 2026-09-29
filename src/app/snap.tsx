// Scan food: take or upload a photo -> preview -> "Identifying your food…" -> nutrition result.
// The recognizer (src/lib/recognition.ts) names the foods; the food database gives the nutrition.
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, DietMark, Empty, FoodIcon, Icon, LightStatusBar, Notice, RoundButton, tap, useToast } from '@/components/ui';
import { ALL_FOODS } from '@/data/foods';
import { AiError } from '@/lib/ai';
import { pickBus } from '@/lib/bus';
import { dayKey } from '@/lib/dates';
import { fmtQty, unitLabel } from '@/lib/format';
import { add, fmt, giBand, kcalStr, scale, ZERO } from '@/lib/nutrition';
import { recognizer, suggestFoods, type Recognition } from '@/lib/recognition';
import { useStore, type Meal } from '@/lib/store';
import { keepPhoto } from '@/lib/photos';
import { useMeals } from '@/lib/summary';
import { C, F, R, T } from '@/theme';
import { goBack } from '@/lib/nav';

type Item = { key: string; foodId: string; unitId: string; qty: number; confidence?: number; seenAs?: string };
type Photo = { uri: string; width?: number };
/** How the result came about: foods identified, nothing identified, the AI failed, or tagged by hand. */
type Outcome = { k: 'found'; n: number } | { k: 'none' } | { k: 'failed'; msg: string } | { k: 'manual' };
type Phase =
  | { k: 'choose' }
  | ({ k: 'preview' } & Photo)
  | ({ k: 'analysing' } & Photo)
  | ({ k: 'result'; outcome: Outcome; unmatched: string[] } & Photo)
  | { k: 'error'; icon: string; title: string; body: string; settings?: boolean };

const newKey = () => Math.random().toString(36).slice(2);
/** True when every word the AI used appears in the food's name (so it isn't a loose match). */
const sameName = (seen: string, name: string) => {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2);
  const inName = new Set(words(name));
  return words(seen).every((w) => inName.has(w));
};

export default function Snap() {
  const { food, addEntries, removeEntry, state } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ k: 'choose' });
  const myMeals = useMeals();
  const [meal, setMeal] = useState<Meal>(myMeals.now);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const run = useRef(0);
  const auto = recognizer().automatic;

  const suggestions = useMemo(() => suggestFoods(state, meal).filter((id) => !items.some((i) => i.foodId === id)), [state, meal, items]);

  /* ---------- capture ---------- */

  const pick = async (source: 'camera' | 'gallery') => {
    if (busy) return;
    setBusy(true);
    try {
      if (source === 'camera' && Platform.OS !== 'web') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setPhase({
            k: 'error',
            icon: 'camera-off-outline',
            title: 'Allow camera access',
            body: perm.canAskAgain
              ? 'Platewise needs the camera to photograph your food. Photos stay on your phone.'
              : 'Camera access is turned off for Platewise. Turn it on in Settings, or upload a photo from your gallery instead.',
            settings: !perm.canAskAgain,
          });
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: false, exif: false };
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (asset.type && asset.type !== 'image') {
        setPhase({ k: 'error', icon: 'file-alert-outline', title: 'That isn’t a photo', body: 'Choose a photo of your food, not a video or other file.' });
        return;
      }
      setItems([]);
      setPhase({ k: 'preview', uri: asset.uri, width: asset.width });
    } catch {
      setPhase({ k: 'error', icon: 'image-broken-variant', title: 'We couldn’t open that photo', body: 'The file may be damaged or in a format this device can’t read. Try another photo.' });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- recognition ---------- */

  const toItems = (r: Recognition): Item[] =>
    r.foods.map((d) => {
      const f = food(d.foodId);
      const u = f?.units[0];
      const byUnit = u && u.grams > 1 && !f?.noWeight;
      return { key: newKey(), foodId: d.foodId, unitId: u?.id ?? 'g', qty: byUnit ? Math.max(0.5, Math.round((d.grams / u.grams) * 2) / 2) : u?.grams === 1 ? d.grams : 1, confidence: d.confidence, seenAs: d.seenAs };
    });

  const analyse = async ({ uri, width }: Photo) => {
    const p: Photo = { uri, width };
    const me = ++run.current;
    const rec = recognizer();
    if (!rec.automatic) {
      setPhase({ k: 'result', ...p, outcome: { k: 'manual' }, unmatched: [] });
      return;
    }
    setPhase({ k: 'analysing', ...p });
    try {
      const r = await rec.recognize(p.uri, [...Object.values(state.custom), ...ALL_FOODS], p.width);
      if (me !== run.current) return;
      const found = r ? toItems(r) : [];
      setItems(found);
      if (found.length) tap('success');
      setPhase({ k: 'result', ...p, outcome: found.length ? { k: 'found', n: found.length } : { k: 'none' }, unmatched: r?.unmatched ?? [] });
    } catch (e) {
      if (me !== run.current) return;
      setPhase({ k: 'result', ...p, outcome: { k: 'failed', msg: e instanceof AiError ? e.message : 'The food couldn’t be identified right now. Try again.' }, unmatched: [] });
    }
  };
  const tagMyself = ({ uri, width }: Photo) => {
    run.current++;
    setPhase({ k: 'result', uri, width, outcome: { k: 'manual' }, unmatched: [] });
  };

  /* ---------- editing the result ---------- */

  const addFood = (foodId: string) => {
    const f = food(foodId);
    if (!f) return;
    tap();
    setItems((xs) => {
      const existing = xs.find((x) => x.foodId === foodId);
      if (existing) return xs.map((x) => (x.key === existing.key ? { ...x, qty: x.qty + (f.units.find((u) => u.id === x.unitId)?.grams === 1 ? 50 : 1) } : x));
      return [...xs, { key: newKey(), foodId, unitId: f.units[0].id, qty: f.units[0].grams === 1 ? 100 : 1 }];
    });
  };
  const step = (key: string, dir: 1 | -1) =>
    setItems((xs) =>
      xs.map((x) => {
        if (x.key !== key) return x;
        const grams = food(x.foodId)?.units.find((u) => u.id === x.unitId)?.grams ?? 1;
        const s = grams === 1 ? 25 : 0.5;
        return { ...x, qty: Math.min(grams === 1 ? 3000 : 20, Math.max(grams === 1 ? 5 : 0.5, x.qty + dir * s)) };
      }),
    );
  const remove = (key: string) => {
    const index = items.findIndex((x) => x.key === key);
    const removed = items[index];
    if (!removed) return;
    setItems((xs) => xs.filter((x) => x.key !== key));
    toast(`Removed ${food(removed.foodId)?.name ?? 'item'}.`, { label: 'Undo', run: () => setItems((xs) => (xs.some((x) => x.key === key) ? xs : [...xs.slice(0, index), removed, ...xs.slice(index)])) });
  };
  const selectAnother = () => {
    pickBus.request(({ foodId }) => addFood(foodId));
    router.push({ pathname: '/log', params: { mode: 'pick' } });
  };
  const openDetail = (it: Item) => router.push({ pathname: '/food/[id]', params: { id: it.foodId, view: '1', unit: it.unitId, qty: String(it.qty) } });

  const rows = items.map((it) => {
    const f = food(it.foodId);
    const unit = f?.units.find((u) => u.id === it.unitId) ?? f?.units[0];
    const grams = unit ? unit.grams * it.qty : 0;
    return { it, f, unit, grams, nut: f ? scale(f, grams) : ZERO };
  });
  const valid = rows.filter((r) => r.f && r.unit);
  const total = valid.reduce((acc, r) => add(acc, r.nut), ZERO);
  const totalGrams = valid.reduce((s, r) => s + (r.f!.noWeight ? 0 : r.grams), 0);
  // Glycemic index of the whole plate: the carb-weighted average of the foods that have one.
  const giCarbs = valid.reduce((s, r) => s + (r.f!.gi != null ? r.nut.carb : 0), 0);
  const plateGi = giCarbs > 0 && giCarbs >= total.carb * 0.5 ? Math.round(valid.reduce((s, r) => s + (r.f!.gi ?? 0) * (r.f!.gi != null ? r.nut.carb : 0), 0) / giCarbs) : null;

  const [saving, setSaving] = useState(false);
  const logMeal = async () => {
    if (!valid.length || phase.k !== 'result' || saving) return;
    setSaving(true);
    const photo = await keepPhoto(phase.uri);
    const day = dayKey();
    const added = addEntries(
      day,
      valid.map((r) => ({ foodId: r.f!.id, unitId: r.unit!.id, qty: r.it.qty, grams: r.grams, meal, t: Date.now(), source: 'snap' as const, photo })),
    );
    tap('success');
    toast(`Logged ${added.length} ${added.length === 1 ? 'food' : 'foods'} to ${meal.toLowerCase()} · ${kcalStr(total.kcal)} kcal`, {
      label: 'Undo',
      run: () => added.forEach((e) => removeEntry(day, e.id)),
    });
    goBack();
  };
  const scanAgain = () => {
    run.current++;
    setItems([]);
    setPhase({ k: 'choose' });
  };
  const home = () => router.dismissTo('/(tabs)');

  const dark = phase.k === 'choose' || phase.k === 'preview' || phase.k === 'analysing';
  const title = phase.k === 'result' ? 'Nutrition result' : phase.k === 'preview' ? 'Preview' : phase.k === 'analysing' ? 'Analysing' : 'Scan food';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#0E1410' : C.bg }} edges={['top', 'bottom']}>
      {dark && <LightStatusBar />}
      <View style={styles.top}>
        <RoundButton icon="arrow-left" label="Back" bg={dark ? 'rgba(255,255,255,0.12)' : C.card} color={dark ? '#fff' : C.ink} onPress={() => goBack()} />
        <Text style={[T.h3, { color: dark ? '#fff' : C.ink, flex: 1, textAlign: 'center' }]}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {phase.k === 'choose' && (
        <View style={{ flex: 1, padding: 18, gap: 14 }}>
          <View style={styles.finder}>
            <View style={[styles.brackets, { pointerEvents: 'none' }]}>
              {[styles.tl, styles.tr, styles.bl, styles.br].map((pos, i) => (
                <View key={i} style={[styles.bracket, pos]} />
              ))}
            </View>
            <Icon name="silverware-variant" size={64} color="rgba(255,255,255,0.25)" />
            <Text style={[T.body, { color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 12, maxWidth: 280 }]}>
              {auto
                ? 'Take a photo of your food or upload one. Platewise identifies the foods and shows their nutrition.'
                : 'Photograph your plate, then tap the foods on it. The photo is saved with the meal so you can look back at what you ate.'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Upload photo" icon="image-outline" kind="onDark" style={{ flex: 1 }} onPress={() => pick('gallery')} disabled={busy} />
            <Button label="Take photo" icon="camera" kind="citrus" style={{ flex: 1.2 }} onPress={() => pick('camera')} loading={busy} />
          </View>
          <Button label="Packaged food? Scan its barcode or QR" icon="barcode-scan" kind="onDark" onPress={() => router.replace({ pathname: '/barcode', params: { meal } })} />
          <Button label="Select food manually" kind="textOnDark" style={{ minHeight: 40 }} onPress={() => router.replace({ pathname: '/log', params: { meal } })} />
        </View>
      )}

      {(phase.k === 'preview' || phase.k === 'analysing') && (
        <View style={{ flex: 1, padding: 18, gap: 14 }}>
          <View style={styles.preview}>
            <Image source={{ uri: phase.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Your food photo" />
            {phase.k === 'analysing' ? (
              <View style={styles.scrim}>
                <ActivityIndicator size="large" color={C.citrus} />
                <Text style={[T.h2, { color: '#fff', textAlign: 'center' }]}>Identifying your food…</Text>
                <Text style={[T.small, { color: 'rgba(255,255,255,0.75)', textAlign: 'center' }]}>Finding the foods and portions, then their nutrition</Text>
              </View>
            ) : null}
          </View>
          {phase.k === 'preview' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Retake" icon="camera-retake-outline" kind="onDark" style={{ flex: 1 }} onPress={scanAgain} />
              <Button label={auto ? 'Analyse food' : 'Tag the foods'} icon={auto ? 'creation' : 'gesture-tap'} kind="citrus" style={{ flex: 1.4 }} onPress={() => analyse(phase)} />
            </View>
          ) : (
            <Button label="Skip, I’ll pick the foods myself" kind="textOnDark" onPress={() => tagMyself(phase)} />
          )}
          {phase.k === 'preview' && auto ? <Text style={[T.tiny, { color: 'rgba(255,255,255,0.55)', textAlign: 'center' }]}>The photo is sent to Google Gemini to identify the food. It stays on your phone otherwise.</Text> : null}
        </View>
      )}

      {phase.k === 'error' && (
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14, flexGrow: 1 }}>
          <View style={{ alignItems: 'center', gap: 10, marginTop: 30 }}>
            <View style={styles.errIcon}>
              <Icon name={phase.icon} size={40} color={C.ink2} />
            </View>
            <Text style={[T.h1, { fontSize: 24, textAlign: 'center' }]}>{phase.title}</Text>
            <Text style={[T.body, { color: C.ink2, textAlign: 'center', maxWidth: 320 }]}>{phase.body}</Text>
          </View>
          <View style={{ marginTop: 'auto', gap: 10 }}>
            {phase.settings ? <Button label="Open Settings" icon="cog-outline" onPress={() => Linking.openSettings()} /> : null}
            <Button label="Try the camera again" icon="camera" kind={phase.settings ? 'ghost' : 'primary'} onPress={() => pick('camera')} />
            <Button label="Upload a photo" icon="image-outline" kind="ghost" onPress={() => pick('gallery')} />
            <Button label="Select food manually" kind="text" onPress={() => router.replace({ pathname: '/log', params: { meal } })} />
          </View>
        </ScrollView>
      )}

      {phase.k === 'result' && (
        <>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            <View style={styles.photo}>
              <Image source={{ uri: phase.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Your food photo" />
              <Pressable onPress={scanAgain} style={styles.retake} accessibilityRole="button">
                <Icon name="camera-retake-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontFamily: F.semi, fontSize: 13 }}>Scan again</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 14, gap: 10 }}>
              {phase.outcome.k === 'found' ? (
                <Notice tone="coach" icon="creation">
                  {`Identified ${phase.outcome.n} ${phase.outcome.n === 1 ? 'food' : 'foods'}. Check the portions, remove anything that’s wrong and add anything missing. Tap a food for its full nutrition.`}
                </Notice>
              ) : null}
              {phase.outcome.k === 'none' ? (
                <View style={styles.notFound}>
                  <Icon name="food-off-outline" size={30} color={C.ink2} />
                  <Text style={[T.h2, { textAlign: 'center' }]}>We couldn’t identify this food.</Text>
                  <Text style={[T.small, { textAlign: 'center' }]}>Try again with the food filling the photo in good light, or select it yourself.</Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
                    <Button label="Try again" icon="refresh" small kind="ghost" style={{ flex: 1 }} onPress={() => analyse(phase)} />
                    <Button label="Select food manually" icon="magnify" small style={{ flex: 1.3 }} onPress={selectAnother} />
                  </View>
                </View>
              ) : null}
              {phase.outcome.k === 'failed' ? (
                <View style={{ gap: 8 }}>
                  <Notice tone="warn" icon="wifi-alert">
                    {phase.outcome.msg}
                  </Notice>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button label="Try again" icon="refresh" small kind="ghost" style={{ flex: 1 }} onPress={() => analyse(phase)} />
                    <Button label="Select food manually" icon="magnify" small style={{ flex: 1.3 }} onPress={selectAnother} />
                  </View>
                </View>
              ) : null}
              {phase.unmatched.map((name) => (
                <Notice key={name} tone="bad" icon="database-off-outline">
                  <Text style={T.small}>
                    {`Nutrition information for “${name}” is currently unavailable. `}
                    <Text style={{ color: C.brand, fontFamily: F.bold }} onPress={selectAnother}>
                      Select another food
                    </Text>
                  </Text>
                </Notice>
              ))}
            </View>

            <Text style={[T.label, { marginTop: 18, marginBottom: 8 }]}>Meal</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {myMeals.options(meal).map((m) => (
                <Chip key={m} label={m} active={m === meal} onPress={() => setMeal(m)} tone={C.brand} />
              ))}
            </ScrollView>

            <Text style={[T.label, { marginTop: 20, marginBottom: 8 }]}>{phase.outcome.k === 'found' ? 'Identified food' : 'On your plate'}</Text>
            {rows.length ? (
              <View style={{ gap: 10 }}>
                {rows.map(({ it, f, unit, grams, nut }) =>
                  f && unit ? (
                    <Card key={it.key} style={{ gap: 10 }}>
                      <Pressable onPress={() => openDetail(it)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="button" accessibilityLabel={`${f.name}, full nutrition`}>
                        <FoodIcon food={f} size={42} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <DietMark diet={f.diet} />
                            <Text style={[T.body, { fontFamily: F.semi, flexShrink: 1 }]} numberOfLines={1}>
                              {f.name}
                            </Text>
                          </View>
                          <Text style={T.tiny}>
                            {f.cat}
                            {f.gi != null ? ` · GI ${giBand(f.gi)}` : ''}
                            {it.confidence != null ? ` · ${Math.round(it.confidence * 100)}% sure` : ''}
                          </Text>
                          {/* The closest match in the database: say what the photo showed, so a loose match is easy to spot. */}
                          {it.seenAs && !sameName(it.seenAs, f.name) ? <Text style={[T.tiny, { color: C.coach }]}>{`Seen as “${it.seenAs}”, closest match`}</Text> : null}
                          <Text style={T.tiny}>
                            {f.noWeight ? '' : `${fmt(grams)} ${f.base} · `}C {fmt(nut.carb)} · P {fmt(nut.protein)} · F {fmt(nut.fat)} g
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontFamily: F.bold, fontSize: 16 }}>{kcalStr(nut.kcal)}</Text>
                          <Text style={T.tiny}>kcal</Text>
                        </View>
                      </Pressable>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <RoundButton icon="minus" label="Less" size={34} bg={C.line2} onPress={() => step(it.key, -1)} />
                        <Text style={{ fontFamily: F.bold, minWidth: 96, textAlign: 'center' }}>
                          {fmtQty(it.qty)} {unitLabel(unit.label, it.qty)}
                        </Text>
                        <RoundButton icon="plus" label="More" size={34} bg={C.line2} onPress={() => step(it.key, 1)} />
                        <View style={{ flex: 1 }} />
                        <RoundButton icon="trash-can-outline" label={`Remove ${f.name}`} size={34} bg="#FBE4DF" color={C.bad} onPress={() => remove(it.key)} />
                      </View>
                    </Card>
                  ) : (
                    <Notice key={it.key} tone="bad" icon="database-off-outline">
                      Nutrition information for this food is currently unavailable. Remove it and select another food.
                    </Notice>
                  ),
                )}
              </View>
            ) : (
              <Card>
                <Empty icon="gesture-tap" title="No foods yet" body="Tap a suggestion below or search to add the foods in your photo." />
              </Card>
            )}

            {phase.outcome.k !== 'found' && suggestions.length ? (
              <>
                <Text style={[T.label, { marginTop: 18, marginBottom: 8 }]}>Tap what you see</Text>
                <View style={styles.suggest}>
                  {suggestions.map((id) => {
                    const f = food(id)!;
                    return (
                      <Pressable key={id} onPress={() => addFood(id)} style={({ pressed }) => [styles.sugg, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`Add ${f.name}`}>
                        <FoodIcon food={f} size={26} />
                        <Text style={[T.small, { color: C.ink, fontFamily: F.semi, flexShrink: 1 }]} numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Icon name="plus" size={16} color={C.brand} />
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
            <Pressable onPress={selectAnother} style={styles.searchBtn} accessibilityRole="button">
              <Icon name="magnify" size={20} color={C.brand} />
              <Text style={[T.body, { color: C.brand, fontFamily: F.semi }]}>Select another food</Text>
            </Pressable>

            {valid.length ? (
              <Card style={{ marginTop: 16, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={T.h3}>Nutrition</Text>
                  {totalGrams ? <Text style={T.small}>Serving: {fmt(totalGrams)} g</Text> : null}
                </View>
                <View style={styles.tiles}>
                  <Tile label="Calories" value={kcalStr(total.kcal)} unit="kcal" big />
                  <Tile label="Energy" value={kcalStr(total.kcal * 4.184)} unit="kJ" big />
                  <Tile label="Carbohydrates" value={fmt(total.carb)} unit="g" color={C.carb} />
                  <Tile label="Protein" value={fmt(total.protein)} unit="g" color={C.protein} />
                  <Tile label="Fat" value={fmt(total.fat)} unit="g" color={C.fat} />
                  <Tile label="Fibre" value={fmt(total.fibre)} unit="g" color={C.fibre} />
                  <Tile label="Sugar" value={fmt(total.sugar)} unit="g" color={C.ink3} />
                  <Tile label="Glycemic index" value={plateGi != null ? giBand(plateGi)! : total.carb < 5 ? 'Not relevant' : 'Not measured'} unit={plateGi != null ? `(${plateGi})` : ''} />
                </View>
                {rows.length > 1 ? <Text style={T.tiny}>Totals for everything above. Tap a food for its own nutrition.</Text> : null}
              </Card>
            ) : null}
          </ScrollView>
          <View style={styles.bottom}>
            <Button label={valid.length ? `Log to ${meal} · ${kcalStr(total.kcal)} kcal` : 'Add at least one food'} disabled={!valid.length} loading={saving} onPress={logMeal} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Scan again" icon="camera-retake-outline" kind="ghost" small style={{ flex: 1 }} onPress={scanAgain} />
              <Button label="Back to home" icon="home-outline" kind="ghost" small style={{ flex: 1 }} onPress={home} />
            </View>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Tile({ label, value, unit, color, big }: { label: string; value: string; unit: string; color?: string; big?: boolean }) {
  return (
    <View style={[styles.tile, big && { backgroundColor: C.brandSoft }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {color ? <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} /> : null}
        <Text style={T.tiny}>{label}</Text>
      </View>
      <Text style={{ fontFamily: F.bold, fontSize: big ? 20 : 16, color: C.ink }}>
        {value}
        {unit ? <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.ink3 }}>{` ${unit}`}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8 },
  finder: { flex: 1, borderRadius: R.xl, backgroundColor: '#1A221D', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'hidden' },
  brackets: { ...StyleSheet.absoluteFill, margin: 28 },
  bracket: { position: 'absolute', width: 38, height: 38, borderColor: '#fff' },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 },
  preview: { flex: 1, borderRadius: R.xl, overflow: 'hidden', backgroundColor: '#1A221D' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,12,10,0.62)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errIcon: { width: 84, height: 84, borderRadius: 28, backgroundColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', aspectRatio: 16 / 10, borderRadius: R.xl, overflow: 'hidden', backgroundColor: C.line2 },
  retake: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, height: 34, borderRadius: 17 },
  notFound: { alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: R.lg, padding: 16, borderWidth: 1, borderColor: C.line },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sugg: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 22, paddingLeft: 5, paddingRight: 12, height: 40, borderWidth: 1, borderColor: C.line, maxWidth: '100%' },
  searchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 13, borderRadius: R.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48.5%', flexGrow: 1, backgroundColor: C.line2, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  bottom: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.line2, backgroundColor: C.bg },
});
