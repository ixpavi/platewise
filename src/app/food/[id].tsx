import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Button, Card, Chip, DietMark, Empty, FoodIcon, Header, Notice, Pill, RoundButton, ScoreBadge, Sheet, tap, useToast } from '@/components/ui';
import { dayKey, isToday, relativeDay, stampFor } from '@/lib/dates';
import { fmtQty, unitLabel } from '@/lib/format';
import { fmt, giBand, healthScore, kcalStr, scale } from '@/lib/nutrition';
import { MEALS, useStore, type Meal } from '@/lib/store';
import { mealForNow, useDaySummary } from '@/lib/summary';
import { C, F, T } from '@/theme';
import { goBack } from '@/lib/nav';

export default function FoodDetail() {
  const params = useLocalSearchParams<{ id: string; day?: string; meal?: string; entry?: string }>();
  const day = params.day || dayKey();
  const { food, day: getDay, addEntries, updateEntry, removeEntry, restoreEntries, toggleFav, state } = useStore();
  const toast = useToast();
  const f = food(params.id);
  const entry = params.entry ? getDay(day).food.find((e) => e.id === params.entry) : undefined;
  const [unitId, setUnitId] = useState(entry?.unitId ?? f?.units[0]?.id ?? 'g');
  const [qty, setQty] = useState(entry?.qty ?? 1);
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? ((MEALS as readonly string[]).includes(params.meal ?? '') ? (params.meal as Meal) : mealForNow()));
  const [qtyText, setQtyText] = useState<string | null>(null);
  const [scoreInfo, setScoreInfo] = useState(false);
  const sum = useDaySummary(day);

  const unit = f?.units.find((u) => u.id === unitId) ?? f?.units[0];
  const grams = unit ? unit.grams * qty : 0;
  const n = f ? scale(f, grams) : null;

  if (!f || !unit || !n) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 18 }}>
        <Header title="Food" onBack={() => goBack()} />
        <Empty icon="food-off-outline" title="This food isn't available" body="It may have been removed. Search for it again." action="Search foods" onAction={() => router.replace({ pathname: '/log', params: { day } })} />
      </SafeAreaView>
    );
  }

  const score = healthScore(f);
  const energy = n.carb * 4 + n.protein * 4 + n.fat * 9;
  const pct = (x: number) => (energy ? Math.round((x / energy) * 100) : 0);
  const fav = state.favs.includes(f.id);
  const already = entry ? scale(f, entry.grams).kcal : 0;
  const after = sum.total.kcal - already + n.kcal;
  const budget = sum.targets.kcal + sum.burned;
  const qtyStep = unit.grams === 1 ? (f.base === 'ml' ? 50 : 25) : 0.5;
  const qtyMin = unit.grams === 1 ? 5 : 0.25;
  const qtyMax = unit.grams === 1 ? 3000 : 20;

  const setQtySafe = (v: number) => setQty(Math.min(qtyMax, Math.max(qtyMin, Math.round(v * 100) / 100)));
  const changeUnit = (id: string) => {
    const u = f.units.find((x) => x.id === id);
    if (!u) return;
    // Keep the same amount of food when switching units.
    const g = grams;
    setUnitId(id);
    setQty(u.grams === 1 ? Math.round(g) : Math.max(0.25, Math.round((g / u.grams) * 4) / 4));
    setQtyText(null);
  };

  const save = () => {
    if (grams <= 0) return;
    if (entry) {
      updateEntry(day, entry.id, { unitId, qty, grams, meal });
      toast('Entry updated.');
    } else {
      const [e] = addEntries(day, [{ foodId: f.id, unitId, qty, grams, meal, t: stampFor(day), source: f.custom ? 'custom' : 'search' }]);
      toast(`Added to ${meal.toLowerCase()} · ${kcalStr(n.kcal)} kcal`, { label: 'Undo', run: () => removeEntry(day, e.id) });
    }
    tap('success');
    goBack();
  };
  const remove = () => {
    if (!entry) return;
    const removed = removeEntry(day, entry.id);
    if (removed) toast(`Removed ${f.name}.`, { label: 'Undo', run: () => restoreEntries(day, [removed]) });
    goBack();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 18 }}>
        <Header
          title={entry ? 'Edit entry' : 'Add food'}
          subtitle={isToday(day) ? undefined : relativeDay(day)}
          onBack={() => goBack()}
          right={<RoundButton icon={fav ? 'star' : 'star-outline'} color={fav ? C.warn : C.ink} label={fav ? 'Remove favourite' : 'Add to favourites'} onPress={() => toggleFav(f.id)} />}
        />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <FoodIcon food={f} size={72} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[T.h1, { fontSize: 24 }]}>{f.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <DietMark diet={f.diet} />
              <Text style={T.small}>{f.cat}</Text>
              {f.id.startsWith('bc-') ? <Pill label="Packaged" color={C.coach} bg={C.coachSoft} /> : f.custom ? <Pill label="Your food" color={C.coach} bg={C.coachSoft} /> : null}
            </View>
          </View>
          <Pressable onPress={() => setScoreInfo(true)} accessibilityRole="button" accessibilityLabel="What is the health score">
            <ScoreBadge score={score} />
          </Pressable>
        </View>

        <Card style={{ gap: 14 }}>
          <Text style={T.h3}>How much?</Text>
          <View style={styles.qtyRow}>
            <RoundButton icon="minus" label="Less" bg={C.line2} onPress={() => (setQtyText(null), setQtySafe(qty - qtyStep))} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <TextInput
                value={qtyText ?? fmtQty(qty)}
                onChangeText={(t) => setQtyText(t.replace(/[^0-9.]/g, ''))}
                onBlur={() => {
                  if (qtyText != null) {
                    const v = Number(qtyText);
                    if (Number.isFinite(v) && v > 0) setQtySafe(v);
                    setQtyText(null);
                  }
                }}
                keyboardType="decimal-pad"
                style={styles.qtyInput}
                accessibilityLabel="Quantity"
                selectTextOnFocus
                maxLength={6}
              />
              <Text style={T.small}>
                {unitLabel(unit.label, qty)}
                {unit.grams !== 1 ? ` · ${fmt(grams)} ${f.base}` : ''}
              </Text>
            </View>
            <RoundButton icon="plus" label="More" bg={C.line2} onPress={() => (setQtyText(null), setQtySafe(qty + qtyStep))} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {f.units.map((u) => (
              <Chip key={u.id} label={u.grams === 1 ? (f.base === 'ml' ? 'ml' : 'grams') : `${u.label} (${u.grams}${f.base})`} active={u.id === unitId} onPress={() => changeUnit(u.id)} tone={C.brand} />
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Donut carb={n.carb * 4} protein={n.protein * 4} fat={n.fat * 9} />
            <View style={{ flex: 1 }}>
              <Text style={[T.num, { fontSize: 40 }]}>{kcalStr(n.kcal)}</Text>
              <Text style={T.small}>kcal · {kcalStr(n.kcal * 4.184)} kJ</Text>
              <Text style={[T.tiny, { marginTop: 6 }]}>{Math.round((n.kcal / sum.targets.kcal) * 100)}% of your daily budget</Text>
            </View>
          </View>
          <View style={{ marginTop: 16, gap: 10 }}>
            <Nut label="Carbs" g={n.carb} pct={pct(n.carb * 4)} color={C.carb} />
            <Nut label="Protein" g={n.protein} pct={pct(n.protein * 4)} color={C.protein} />
            <Nut label="Fat" g={n.fat} pct={pct(n.fat * 9)} color={C.fat} />
            <View style={styles.split} />
            <Nut label="Fibre" g={n.fibre} color={C.fibre} />
            <Nut label="Sugar" g={n.sugar} color={C.ink3} />
            <View style={styles.nutRow}>
              <Text style={T.body}>Glycemic index</Text>
              <Text style={[T.body, { fontFamily: F.bold, color: f.gi == null ? C.ink3 : f.gi <= 55 ? C.good : f.gi < 70 ? C.warn : C.bad }]}>
                {f.gi == null ? (f.n.carb < 5 ? 'Not relevant' : 'Not measured') : `${f.gi} · ${giBand(f.gi)}`}
              </Text>
            </View>
          </View>
        </Card>

        <View style={{ marginTop: 12 }}>
          <Notice icon={after > budget ? 'alert-circle-outline' : 'check-circle-outline'} tone={after > budget ? 'warn' : 'info'}>
            <Text style={T.small}>
              {entry ? 'With this change' : 'After this'}, {isToday(day) ? 'today' : relativeDay(day).toLowerCase()} reaches <Text style={{ fontFamily: F.bold, color: C.ink }}>{kcalStr(after)}</Text> of{' '}
              <Text style={{ fontFamily: F.bold, color: C.ink }}>{kcalStr(budget)}</Text> kcal{after > budget ? `, ${kcalStr(after - budget)} over.` : `, ${kcalStr(budget - after)} left.`}
            </Text>
          </Notice>
        </View>

        <Text style={[T.label, { marginTop: 20, marginBottom: 8 }]}>Meal</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {MEALS.map((m) => (
            <Chip key={m} label={m} active={m === meal} onPress={() => setMeal(m)} tone={C.brand} />
          ))}
        </ScrollView>
        <Text style={[T.tiny, { marginTop: 18 }]}>
          Values per 100 {f.base}: {f.n.kcal} kcal, carbs {f.n.carb} g, protein {f.n.protein} g, fat {f.n.fat} g. {f.id.startsWith('bc-') ? 'From Open Food Facts; check against the pack.' : f.custom ? 'Values you entered for this food.' : 'Approximate reference values (IFCT / USDA).'}
        </Text>
      </ScrollView>

      <View style={styles.bottom}>
        {entry ? <RoundButton icon="trash-can-outline" label="Remove entry" bg="#FBE4DF" color={C.bad} size={52} onPress={remove} /> : null}
        <Button label={entry ? 'Save changes' : `Add to ${meal} · ${kcalStr(n.kcal)} kcal`} onPress={save} style={{ flex: 1 }} disabled={grams <= 0} />
      </View>

      <Sheet visible={scoreInfo} onClose={() => setScoreInfo(false)} title={`Health score ${score}/10`}>
        <Text style={[T.body, { color: C.ink2 }]}>
          The score rates how much nutrition a food gives for its calories. Protein and fibre raise it. Added sugar, very fat-heavy energy and a high glycemic index lower it. It’s a guide for choosing between foods, not a rule.
        </Text>
        <Button label="Got it" kind="ghost" style={{ marginTop: 16 }} onPress={() => setScoreInfo(false)} />
      </Sheet>
    </SafeAreaView>
  );
}

function Nut({ label, g, pct, color }: { label: string; g: number; pct?: number; color: string }) {
  return (
    <View style={styles.nutRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} />
        <Text style={T.body}>{label}</Text>
      </View>
      <Text style={[T.body, { fontFamily: F.bold }]}>
        {fmt(g)} g{pct != null ? <Text style={{ color: C.ink3, fontFamily: F.medium }}>{`  ${pct}%`}</Text> : null}
      </Text>
    </View>
  );
}

function Donut({ carb, protein, fat }: { carb: number; protein: number; fat: number }) {
  const size = 92;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = carb + protein + fat;
  const parts = total ? [{ v: carb, color: C.carb }, { v: protein, color: C.protein }, { v: fat, color: C.fat }] : [];
  let offset = 0;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }} accessibilityLabel="Energy split by macronutrient">
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.line2} strokeWidth={stroke} fill="none" />
      {parts.map((p, i) => {
        const len = (p.v / total) * c;
        const el = <Circle key={i} cx={size / 2} cy={size / 2} r={r} stroke={p.color} strokeWidth={stroke} fill="none" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} />;
        offset += len;
        return el;
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyInput: { fontFamily: F.displayHeavy, fontSize: 34, color: C.ink, textAlign: 'center', minWidth: 90, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  nutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  split: { height: 1, backgroundColor: C.line2, marginVertical: 2 },
  bottom: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line2 },
});

