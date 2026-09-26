import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, DietMark, Empty, FoodIcon, Icon, LightStatusBar, Notice, RoundButton, tap, useToast } from '@/components/ui';
import { pickBus } from '@/lib/bus';
import { dayKey } from '@/lib/dates';
import { fmtQty, unitLabel } from '@/lib/format';
import { add, fmt, kcalStr, scale, ZERO } from '@/lib/nutrition';
import { recognizer, suggestFoods } from '@/lib/recognition';
import { MEALS, useStore, type Meal } from '@/lib/store';
import { keepPhoto } from '@/lib/photos';
import { mealForNow } from '@/lib/summary';
import { C, F, R, T } from '@/theme';
import { goBack } from '@/lib/nav';

type Item = { key: string; foodId: string; unitId: string; qty: number };
type Phase =
  | { k: 'choose' }
  | { k: 'tag'; uri: string }
  | { k: 'error'; icon: string; title: string; body: string; settings?: boolean };

const newKey = () => Math.random().toString(36).slice(2);

export default function Snap() {
  const { food, addEntries, removeEntry, state } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ k: 'choose' });
  const [meal, setMeal] = useState<Meal>(mealForNow());
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

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
              ? 'Platewise needs the camera to photograph your meal. Photos stay on your phone.'
              : 'Camera access is turned off for Platewise. Turn it on in Settings, or choose a photo from your gallery instead.',
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
      const detected = await recognizer.recognize(asset.uri);
      if (detected?.length) {
        setItems(
          detected.map((d) => {
            const f = food(d.foodId);
            const u = f?.units[0];
            return { key: newKey(), foodId: d.foodId, unitId: u?.id ?? 'g', qty: u && u.grams > 1 ? Math.max(0.5, Math.round((d.grams / u.grams) * 2) / 2) : d.grams };
          }),
        );
      }
      setPhase({ k: 'tag', uri: asset.uri });
    } catch {
      setPhase({ k: 'error', icon: 'image-broken-variant', title: 'We couldn’t open that photo', body: 'The file may be damaged or in a format this device can’t read. Try another photo.' });
    } finally {
      setBusy(false);
    }
  };

  /* ---------- tagging ---------- */

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
  const searchToAdd = () => {
    pickBus.request(({ foodId }) => addFood(foodId));
    router.push({ pathname: '/log', params: { mode: 'pick' } });
  };

  const rows = items.map((it) => {
    const f = food(it.foodId);
    const unit = f?.units.find((u) => u.id === it.unitId) ?? f?.units[0];
    const grams = unit ? unit.grams * it.qty : 0;
    return { it, f, unit, grams, nut: f ? scale(f, grams) : ZERO };
  });
  const valid = rows.filter((r) => r.f && r.unit);
  const total = valid.reduce((acc, r) => add(acc, r.nut), ZERO);

  const [saving, setSaving] = useState(false);
  const logMeal = async () => {
    if (!valid.length || phase.k !== 'tag' || saving) return;
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

  const dark = phase.k === 'choose';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#0E1410' : C.bg }} edges={['top', 'bottom']}>
      {dark && <LightStatusBar />}
      <View style={styles.top}>
        <RoundButton icon="close" label="Close" bg={dark ? 'rgba(255,255,255,0.12)' : C.card} color={dark ? '#fff' : C.ink} onPress={() => goBack()} />
        <Text style={[T.h3, { color: dark ? '#fff' : C.ink, flex: 1, textAlign: 'center' }]}>{phase.k === 'tag' ? 'What’s on your plate?' : 'Photo log'}</Text>
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
            <Text style={[T.body, { color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 12, maxWidth: 270 }]}>
              Photograph your plate, then tap the foods on it. The photo is saved with the meal so you can look back at what you ate.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Gallery" icon="image-outline" kind="onDark" style={{ flex: 1 }} onPress={() => pick('gallery')} disabled={busy} />
            <Button label="Take photo" icon="camera" kind="citrus" style={{ flex: 1.4 }} onPress={() => pick('camera')} loading={busy} />
          </View>
          <Button label="Packaged food? Scan its barcode" icon="barcode-scan" kind="onDark" onPress={() => router.replace({ pathname: '/barcode', params: { meal } })} />
          <Button label="Skip the photo, just search" kind="textOnDark" style={{ minHeight: 40 }} onPress={() => router.replace({ pathname: '/log', params: { meal } })} />
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
            <Button label="Choose from gallery" icon="image-outline" kind="ghost" onPress={() => pick('gallery')} />
            <Button label="Select food manually" kind="text" onPress={() => router.replace({ pathname: '/log', params: { meal } })} />
          </View>
        </ScrollView>
      )}

      {phase.k === 'tag' && (
        <>
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            <View style={styles.photo}>
              <Image source={{ uri: phase.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Your meal photo" />
              <Pressable onPress={() => setPhase({ k: 'choose' })} style={styles.retake} accessibilityRole="button">
                <Icon name="camera-retake-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontFamily: F.semi, fontSize: 13 }}>Retake</Text>
              </Pressable>
            </View>

            <Text style={[T.label, { marginTop: 18, marginBottom: 8 }]}>Meal</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {MEALS.map((m) => (
                <Chip key={m} label={m} active={m === meal} onPress={() => setMeal(m)} tone={C.brand} />
              ))}
            </ScrollView>

            {suggestions.length ? (
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
            <Pressable onPress={searchToAdd} style={styles.searchBtn} accessibilityRole="button">
              <Icon name="magnify" size={20} color={C.brand} />
              <Text style={[T.body, { color: C.brand, fontFamily: F.semi }]}>Search for another food</Text>
            </Pressable>

            <Text style={[T.label, { marginTop: 20, marginBottom: 8 }]}>On your plate</Text>
            {rows.length ? (
              <View style={{ gap: 10 }}>
                {rows.map(({ it, f, unit, grams, nut }) =>
                  f && unit ? (
                    <Card key={it.key} style={{ gap: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <FoodIcon food={f} size={42} />
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <DietMark diet={f.diet} />
                            <Text style={[T.body, { fontFamily: F.semi, flexShrink: 1 }]} numberOfLines={1}>
                              {f.name}
                            </Text>
                          </View>
                          <Text style={T.tiny}>
                            {fmt(grams)} {f.base} · C {fmt(nut.carb)} · P {fmt(nut.protein)} · F {fmt(nut.fat)} g
                          </Text>
                        </View>
                        <Text style={{ fontFamily: F.bold, fontSize: 16 }}>{kcalStr(nut.kcal)}</Text>
                      </View>
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
                      Nutrition information for this food is currently unavailable. Remove it and pick another food.
                    </Notice>
                  ),
                )}
              </View>
            ) : (
              <Card>
                <Empty icon="gesture-tap" title="Nothing tagged yet" body="Tap a suggestion above or search to add the foods in your photo." />
              </Card>
            )}

            {valid.length ? (
              <View style={styles.totals}>
                <View>
                  <Text style={[T.num, { color: '#fff', fontSize: 32 }]}>{kcalStr(total.kcal)}</Text>
                  <Text style={[T.tiny, { color: 'rgba(255,255,255,0.6)' }]}>kcal total</Text>
                </View>
                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
                  {(
                    [
                      ['Carbs', total.carb, C.carb],
                      ['Protein', total.protein, C.protein],
                      ['Fat', total.fat, C.fat],
                    ] as const
                  ).map(([l, v, c]) => (
                    <View key={l} style={{ alignItems: 'center' }}>
                      <Text style={{ fontFamily: F.bold, color: '#fff', fontSize: 16 }}>{fmt(v)} g</Text>
                      <Text style={{ fontFamily: F.medium, color: c, fontSize: 12 }}>{l}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.bottom}>
            <Button label={valid.length ? `Log ${valid.length} ${valid.length === 1 ? 'food' : 'foods'} to ${meal}` : 'Tag at least one food'} disabled={!valid.length} loading={saving} onPress={logMeal} />
          </View>
        </>
      )}
    </SafeAreaView>
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
  errIcon: { width: 84, height: 84, borderRadius: 28, backgroundColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: R.xl, overflow: 'hidden', backgroundColor: C.line2 },
  retake: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, height: 34, borderRadius: 17 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sugg: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 22, paddingLeft: 5, paddingRight: 12, height: 40, borderWidth: 1, borderColor: C.line, maxWidth: '100%' },
  searchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 13, borderRadius: R.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line },
  totals: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: C.ink, borderRadius: R.lg, padding: 16, marginTop: 14 },
  bottom: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.line2, backgroundColor: C.bg },
});
