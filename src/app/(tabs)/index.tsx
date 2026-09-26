import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bar, Card, FoodIcon, Icon, Notice, Ring, RoundButton, Screen, Section, useToast } from '@/components/ui';
import { PhotoStrip, PhotoViewer } from '@/components/photos';
import { addDays, dayKey, fromKey, greeting, isToday, lastNDays, relativeDay, weekdayShort } from '@/lib/dates';
import { fmtQty, unitLabel } from '@/lib/format';
import { fmt, fmtKg, kcalStr } from '@/lib/nutrition';
import { MEALS, useStore, type Meal } from '@/lib/store';
import { mealForNow, useDaySummary, type DaySummary } from '@/lib/summary';
import { C, F, R, T } from '@/theme';

const MEAL_SHARE: Record<Meal, number> = { Breakfast: 0.25, 'Morning snack': 0.1, Lunch: 0.3, 'Evening snack': 0.1, Dinner: 0.25 };
const MEAL_ICON: Record<Meal, string> = { Breakfast: 'coffee-outline', 'Morning snack': 'food-apple-outline', Lunch: 'silverware-fork-knife', 'Evening snack': 'cookie-outline', Dinner: 'weather-night' };

export default function Home() {
  const { state, day } = useStore();
  const [selected, setSelected] = useState(dayKey());
  const sum = useDaySummary(selected);
  const first = (state.profile?.name || state.account?.name || 'there').split(' ')[0];

  const streak = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 365; i++) {
      const k = addDays(dayKey(), -i);
      if (day(k).food.length) n++;
      else if (i > 0) break;
    }
    return n;
  }, [day]);

  return (
    <Screen bottomInset={40}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={T.small}>{greeting()},</Text>
          <Text style={[T.h1, { fontSize: 26 }]} numberOfLines={1}>
            {first}
          </Text>
        </View>
        {streak > 0 ? (
          <View style={styles.streak} accessibilityLabel={`${streak} day logging streak`}>
            <Icon name="fire" size={18} color={C.steps} />
            <Text style={{ fontFamily: F.bold, color: C.ink }}>{streak}</Text>
          </View>
        ) : null}
        <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatar} accessibilityLabel="Your profile">
          <Text style={{ fontFamily: F.display, color: C.brand, fontSize: 16 }}>{first.slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>

      <DateStrip selected={selected} onSelect={setSelected} hasLog={(k) => day(k).food.length > 0} />

      <BudgetCard sum={sum} />

      {isToday(selected) ? (
        <Pressable onPress={() => router.push('/snap')} style={({ pressed }) => [styles.snap, pressed && { opacity: 0.9 }]} accessibilityRole="button">
          <View style={styles.snapRing} />
          <View style={{ flex: 1 }}>
            <Text style={[T.label, { color: C.citrusInk, opacity: 0.6 }]}>Snap</Text>
            <Text style={{ fontFamily: F.display, fontSize: 21, color: C.citrusInk, letterSpacing: -0.4 }}>Snap your {mealForNow().toLowerCase()}</Text>
            <Text style={[T.small, { color: C.citrusInk, opacity: 0.75 }]}>Photo your plate, tap the foods, done.</Text>
          </View>
          <View style={styles.snapBtn}>
            <Icon name="camera-iris" size={26} color={C.citrus} />
          </View>
        </Pressable>
      ) : (
        <Notice icon="calendar-edit">{`You're viewing ${relativeDay(selected).toLowerCase()}. Anything you add goes to that day.`}</Notice>
      )}

      <Section title="Meals">
        <View style={{ gap: 10 }}>
          {MEALS.map((m) => (
            <MealCard key={m} meal={m} day={selected} sum={sum} />
          ))}
        </View>
      </Section>

      <Section title="Weight">
        <WeightCard />
      </Section>

      <DailyTip sum={sum} />
    </Screen>
  );
}

/* ---------------- date strip ---------------- */

function DateStrip({ selected, onSelect, hasLog }: { selected: string; onSelect: (k: string) => void; hasLog: (k: string) => boolean }) {
  const days = lastNDays(7);
  return (
    <View style={styles.strip}>
      {days.map((k) => {
        const on = k === selected;
        return (
          <Pressable key={k} onPress={() => onSelect(k)} style={[styles.day, on && styles.dayOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={relativeDay(k)}>
            <Text style={[T.tiny, on && { color: 'rgba(255,255,255,0.8)' }]}>{weekdayShort(k)}</Text>
            <Text style={[styles.dayNum, on && { color: '#fff' }]}>{fromKey(k).getDate()}</Text>
            <View style={[styles.dot, { backgroundColor: hasLog(k) ? (on ? C.citrus : C.brand) : 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- calorie budget ---------------- */

function BudgetCard({ sum }: { sum: DaySummary }) {
  const t = sum.targets;
  const budget = t.kcal;
  const left = budget - sum.total.kcal;
  const over = left < 0;
  return (
    <Card style={{ marginTop: 14 }} onPress={() => router.push('/(tabs)/insights')} accessibilityLabel="Calorie budget. Opens progress">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stat label="Eaten" value={kcalStr(sum.total.kcal)} icon="silverware-fork-knife" />
        <Ring size={134} stroke={12} progress={budget ? sum.total.kcal / budget : 0} color={over ? C.bad : C.brand}>
          <Text style={[T.num, { fontSize: 30, color: over ? C.bad : C.ink }]}>{kcalStr(Math.abs(left))}</Text>
          <Text style={T.tiny}>{over ? 'kcal over' : 'kcal left'}</Text>
        </Ring>
        <Stat label="Budget" value={kcalStr(budget)} icon="flag-checkered" />
      </View>
      <View style={styles.macros}>
        <MacroBar label="Carbs" v={sum.total.carb} t={t.carb} color={C.carb} />
        <MacroBar label="Protein" v={sum.total.protein} t={t.protein} color={C.protein} />
        <MacroBar label="Fat" v={sum.total.fat} t={t.fat} color={C.fat} />
        <MacroBar label="Fibre" v={sum.total.fibre} t={t.fibre} color={C.fibre} />
      </View>
    </Card>
  );
}
function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={{ alignItems: 'center', width: 76 }}>
      <Icon name={icon} size={18} color={C.ink3} />
      <Text style={[T.num, { fontSize: 19, marginTop: 4 }]}>{value}</Text>
      <Text style={T.tiny}>{label}</Text>
    </View>
  );
}
function MacroBar({ label, v, t, color }: { label: string; v: number; t: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text style={[T.tiny, { color: C.ink2 }]}>{label}</Text>
      <Bar value={v} max={t} color={color} height={6} />
      <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.ink }}>
        {fmt(v)}
        <Text style={{ color: C.ink3, fontFamily: F.medium }}>/{t}g</Text>
      </Text>
    </View>
  );
}

/* ---------------- meals ---------------- */

function MealCard({ meal, day, sum }: { meal: Meal; day: string; sum: DaySummary }) {
  const { removeEntry, restoreEntries, addEntries, day: getDay, food } = useStore();
  const toast = useToast();
  const m = sum.byMeal[meal];
  const target = Math.round((sum.targets.kcal * MEAL_SHARE[meal]) / 10) * 10;
  const yesterday = getDay(addDays(day, -1)).food.filter((e) => e.meal === meal && food(e.foodId));
  const photos = Array.from(new Set(m.rows.map((r) => r.photo).filter((p): p is string => !!p)));
  const [viewing, setViewing] = useState<string | null>(null);

  const repeat = () => {
    const added = addEntries(
      day,
      yesterday.map(({ id, ...e }) => ({ ...e, t: Date.now(), source: 'repeat' as const })),
    );
    toast(`Copied ${added.length} ${added.length === 1 ? 'item' : 'items'} from yesterday.`, {
      label: 'Undo',
      run: () => added.forEach((e) => removeEntry(day, e.id)),
    });
  };

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={styles.mealHead}>
        <View style={styles.mealIcon}>
          <Icon name={MEAL_ICON[meal]} size={20} color={C.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={T.h3}>{meal}</Text>
          <Text style={T.small}>
            {m.rows.length ? `${kcalStr(m.total.kcal)} of ${kcalStr(target)} kcal` : `Aim for about ${kcalStr(target)} kcal`}
          </Text>
        </View>
        <RoundButton icon="plus" label={`Add to ${meal}`} bg={C.brandSoft} color={C.brand} size={38} onPress={() => router.push({ pathname: '/log', params: { meal, day } })} />
      </View>
      <PhotoStrip uris={photos} onOpen={setViewing} />
      <PhotoViewer uri={viewing} caption={`${meal} · ${kcalStr(m.total.kcal)} kcal`} onClose={() => setViewing(null)} />
      {m.rows.length ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
          {m.rows.map((r) => (
            <Pressable
              key={r.id}
              style={styles.entry}
              onPress={() => router.push({ pathname: '/food/[id]', params: { id: r.foodId, day, entry: r.id } })}
              onLongPress={() => {
                const removed = removeEntry(day, r.id);
                if (removed) toast(`Removed ${r.food.name}.`, { label: 'Undo', run: () => restoreEntries(day, [removed]) });
              }}
              accessibilityHint="Opens details. Long press to remove."
            >
              <FoodIcon food={r.food} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={[T.body, { fontFamily: F.semi }]} numberOfLines={1}>
                  {r.food.name}
                </Text>
                <Text style={T.tiny}>
                  {fmtQty(r.qty)} {unitLabel(r.food.units.find((u) => u.id === r.unitId)?.label ?? r.food.base, r.qty)}
                  {r.source === 'snap' ? ' · from photo' : r.food.id.startsWith('bc-') ? ' · scanned' : r.food.custom ? ' · your food' : ''}
                </Text>
              </View>
              <Text style={{ fontFamily: F.bold, color: C.ink }}>{kcalStr(r.nut.kcal)}</Text>
            </Pressable>
          ))}
        </View>
      ) : yesterday.length ? (
        <Pressable onPress={repeat} style={styles.repeat} accessibilityRole="button">
          <Icon name="history" size={16} color={C.brand} />
          <Text style={[T.small, { color: C.brand, fontFamily: F.semi }]}>Same as yesterday? Add {yesterday.length} {yesterday.length === 1 ? 'item' : 'items'}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/* ---------------- weight ---------------- */

function WeightCard() {
  const { state } = useStore();
  const p = state.profile!;
  const w = state.weights;
  const latest = w.length ? w[w.length - 1].kg : p.weightKg;
  const start = w.length ? w[0].kg : p.weightKg;
  const toGo = Math.round((latest - p.targetKg) * 10) / 10;
  const progress = p.goal === 'maintain' || start === p.targetKg ? 1 : (start - latest) / (start - p.targetKg);
  return (
    <Card onPress={() => router.push('/weight')} accessibilityLabel="Weight">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={[styles.mealIcon, { backgroundColor: C.weightSoft }]}>
          <Icon name="scale-bathroom" size={22} color={C.weight} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={T.h3}>Weight</Text>
            <Text style={T.small}>
              <Text style={{ fontFamily: F.bold, color: C.ink }}>{fmtKg(latest)} kg</Text>
              {p.goal === 'maintain' ? '' : ` · goal ${fmtKg(p.targetKg)} kg`}
            </Text>
          </View>
          {p.goal === 'maintain' ? (
            <Text style={T.tiny}>Log weekly to keep an eye on your trend.</Text>
          ) : (
            <>
              <Bar value={Math.max(0, progress)} max={1} color={C.weight} />
              <Text style={T.tiny}>{Math.abs(toGo) < 0.1 ? 'Goal reached. Nice work.' : `${fmtKg(Math.abs(toGo))} kg to ${toGo > 0 ? 'lose' : 'gain'}`}</Text>
            </>
          )}
        </View>
        <Icon name="chevron-right" size={22} color={C.ink3} />
      </View>
    </Card>
  );
}

/* ---------------- rule-based daily tip ---------------- */

function DailyTip({ sum }: { sum: DaySummary }) {
  const { state } = useStore();
  const t = sum.targets;
  const h = new Date().getHours();
  const veg = state.profile?.diet === 'veg';
  type Tip = { icon: string; text: string; action: string; go: () => void };
  let tip: Tip;
  if (!sum.rows.length) tip = { icon: 'camera-iris', text: 'Log your first meal of the day. A photo and a few taps is all it takes.', action: 'Log with a photo', go: () => router.push('/snap') };
  else if (sum.total.kcal > t.kcal) tip = { icon: 'food-apple-outline', text: `You're ${kcalStr(sum.total.kcal - t.kcal)} kcal over today. Keep the next meal light: dal, sabzi and salad fill you up for fewer calories.`, action: 'Browse foods', go: () => router.push('/(tabs)/foods') };
  else if (h >= 15 && sum.total.protein < t.protein * 0.5) tip = { icon: 'arm-flex-outline', text: `Protein is at ${Math.round((sum.total.protein / t.protein) * 100)}% of your target. ${veg ? 'A katori of dal or 100 g paneer adds 9–18 g.' : 'Two eggs or 100 g chicken add 13–30 g.'}`, action: 'See protein-rich foods', go: () => router.push('/(tabs)/foods') };
  else if (h >= 16 && sum.total.fibre < t.fibre * 0.4) tip = { icon: 'sprout', text: 'Fibre is low today. Add salad, sprouts or a fruit to your next meal.', action: 'Browse foods', go: () => router.push('/(tabs)/foods') };
  else tip = { icon: 'check-decagram-outline', text: `You're on track. ${kcalStr(Math.max(0, t.kcal - sum.total.kcal))} kcal left for the rest of the day.`, action: 'See progress', go: () => router.push('/(tabs)/insights') };
  return (
    <Card style={{ marginTop: 22, backgroundColor: C.coachSoft }} onPress={tip.go} accessibilityLabel={`Tip: ${tip.text}`}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={[styles.mealIcon, { backgroundColor: C.coach }]}>
          <Icon name={tip.icon} size={20} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[T.label, { color: C.coach }]}>Today’s tip</Text>
          <Text style={T.body}>{tip.text}</Text>
          <Text style={[T.small, { color: C.coach, fontFamily: F.bold, marginTop: 4 }]}>{tip.action} →</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.stepsSoft, paddingHorizontal: 10, height: 34, borderRadius: 17 },
  strip: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 16, gap: 2 },
  dayOn: { backgroundColor: C.brand },
  dayNum: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  macros: { flexDirection: 'row', gap: 12, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line2 },
  snap: { marginTop: 14, backgroundColor: C.citrus, borderRadius: R.xl, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' },
  snapRing: { position: 'absolute', right: -40, top: -50, width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: 'rgba(42,33,6,0.1)' },
  snapBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.citrusInk, alignItems: 'center', justifyContent: 'center' },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  mealIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line2 },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line2 },
});
