import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Bar, Card, Empty, Icon, Screen, Section, Segmented } from '@/components/ui';
import { fromKey } from '@/lib/dates';
import { fmt, kcalStr, scale } from '@/lib/nutrition';
import { useStore } from '@/lib/store';
import { useRange, useTargets } from '@/lib/summary';
import { C, F, T } from '@/theme';

export default function Insights() {
  const [range, setRange] = useState<'Week' | 'Month'>('Week');
  const n = range === 'Week' ? 7 : 30;
  const days = useRange(n);
  const t = useTargets();
  const { state, food, day } = useStore();
  const { width } = useWindowDimensions();
  const chartW = Math.min(width, 560) - 36 - 32;

  const logged = days.filter((d) => d.logged);
  const avg = (fn: (d: (typeof days)[number]) => number, list = logged) => (list.length ? list.reduce((s, d) => s + fn(d), 0) / list.length : 0);
  const avgKcal = avg((d) => d.total.kcal);
  const onTarget = logged.filter((d) => Math.abs(d.total.kcal - t.kcal) <= t.kcal * 0.1).length;
  const avgC = avg((d) => d.total.carb);
  const avgP = avg((d) => d.total.protein);
  const avgF = avg((d) => d.total.fat);
  const avgFib = avg((d) => d.total.fibre);
  const energy = avgC * 4 + avgP * 4 + avgF * 9;

  const topFoods = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of days) {
      for (const e of day(d.key).food) {
        const f = food(e.foodId);
        if (f) m.set(f.id, (m.get(f.id) ?? 0) + scale(f, e.grams).kcal);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, kcal]) => ({ f: food(id)!, kcal }));
  }, [days, day, food]);
  const topTotal = topFoods.reduce((s, x) => s + x.kcal, 0) || 1;

  return (
    <Screen bottomInset={40}>
      <View style={{ paddingTop: 14, paddingBottom: 12, gap: 12 }}>
        <Text style={T.h1}>Progress</Text>
        <Segmented options={['Week', 'Month'] as const} value={range} onChange={setRange} labels={{ Week: 'Last 7 days', Month: 'Last 30 days' }} />
      </View>

      {!logged.length ? (
        <Card>
          <Empty icon="chart-bar" title="No logs in this period" body="Log a few meals and your trends show up here. Want to see how it looks? Load sample data from Settings." action="Open settings" onAction={() => router.push('/settings')} />
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Kpi label="Avg eaten" value={kcalStr(avgKcal)} unit="kcal" sub={`budget ${kcalStr(t.kcal)}`} />
            <Kpi label="On target" value={`${onTarget}/${logged.length}`} unit="days" sub="within 10%" />
            <Kpi label="Logged" value={`${logged.length}`} unit={`of ${n}`} sub="days" />
          </View>

          <Section title="Calories">
            <Card>
              <CalorieChart days={days} target={t.kcal} width={chartW} />
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <Legend color={C.brand} label="Within budget" />
                <Legend color={C.bad} label="Over by 10%+" />
                <Legend dashed label="Budget" />
              </View>
            </Card>
          </Section>

          <Section title="Average macros">
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', height: 14, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
                <View style={{ flex: avgC * 4 || 1, backgroundColor: C.carb }} />
                <View style={{ flex: avgP * 4 || 1, backgroundColor: C.protein }} />
                <View style={{ flex: avgF * 9 || 1, backgroundColor: C.fat }} />
              </View>
              <MacroRow label="Carbs" g={avgC} target={t.carb} pct={energy ? (avgC * 4) / energy : 0} color={C.carb} />
              <MacroRow label="Protein" g={avgP} target={t.protein} pct={energy ? (avgP * 4) / energy : 0} color={C.protein} />
              <MacroRow label="Fat" g={avgF} target={t.fat} pct={energy ? (avgF * 9) / energy : 0} color={C.fat} />
              <MacroRow label="Fibre" g={avgFib} target={t.fibre} color={C.fibre} />
              <Text style={T.tiny}>Averages over days you logged. Share is of energy from macros.</Text>
            </Card>
          </Section>
        </>
      )}

      <Section title="Weight" action="Log weight" onAction={() => router.push('/weight')}>
        <Card>
          {state.weights.length >= 2 ? (
            <WeightChart points={state.weights.slice(-Math.max(n, 7))} target={state.profile?.goal === 'maintain' ? null : state.profile?.targetKg ?? null} width={chartW} />
          ) : (
            <Empty icon="scale-bathroom" title="Log your weight to see a trend" body="Weigh yourself at the same time of day, once or twice a week." action="Log weight" onAction={() => router.push('/weight')} />
          )}
        </Card>
      </Section>

      {logged.length ? (
        <>
          <Section title="Habits">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Habit icon="water" color={C.water} label="Water" value={`${fmt(avg((d) => d.waterMl, days) / 1000)} L`} sub="avg a day" />
              <Habit icon="shoe-print" color={C.steps} label="Steps" value={Math.round(avg((d) => d.steps, days)).toLocaleString('en-IN')} sub="avg a day" />
              <Habit icon="power-sleep" color={C.sleep} label="Sleep" value={`${fmt(avg((d) => d.sleepHrs ?? 0, days.filter((d) => d.sleepHrs != null)))} h`} sub="avg a night" />
            </View>
          </Section>

          <Section title="Where your calories came from">
            <Card style={{ gap: 12 }}>
              {topFoods.map(({ f, kcal }) => (
                <View key={f.id} style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[T.body, { fontFamily: F.semi, flex: 1 }]} numberOfLines={1}>
                      {f.name}
                    </Text>
                    <Text style={T.small}>
                      {kcalStr(kcal)} kcal · {Math.round((kcal / topTotal) * 100)}%
                    </Text>
                  </View>
                  <Bar value={kcal} max={topFoods[0].kcal} color={C.brand} height={6} />
                </View>
              ))}
            </Card>
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

function Kpi({ label, value, unit, sub }: { label: string; value: string; unit: string; sub: string }) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 2 }}>
      <Text style={T.tiny}>{label}</Text>
      <Text style={[T.num, { fontSize: 22 }]}>
        {value} <Text style={[T.tiny, { fontFamily: F.medium }]}>{unit}</Text>
      </Text>
      <Text style={T.tiny}>{sub}</Text>
    </Card>
  );
}
function Legend({ color, label, dashed }: { color?: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dashed ? <View style={{ width: 14, borderTopWidth: 2, borderStyle: 'dashed', borderColor: C.ink3 }} /> : <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />}
      <Text style={T.tiny}>{label}</Text>
    </View>
  );
}
function MacroRow({ label, g, target, pct, color }: { label: string; g: number; target: number; pct?: number; color: string }) {
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={T.body}>{label}</Text>
        <Text style={T.small}>
          <Text style={{ fontFamily: F.bold, color: C.ink }}>{fmt(g)} g</Text> / {target} g{pct != null ? ` · ${Math.round(pct * 100)}%` : ''}
        </Text>
      </View>
      <Bar value={g} max={target} color={color} height={6} />
    </View>
  );
}
function Habit({ icon, color, label, value, sub }: { icon: string; color: string; label: string; value: string; sub: string }) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 4 }}>
      <Icon name={icon} size={20} color={color} />
      <Text style={[T.num, { fontSize: 19 }]}>{value}</Text>
      <Text style={T.tiny}>
        {label} · {sub}
      </Text>
    </Card>
  );
}

function CalorieChart({ days, target, width }: { days: { key: string; total: { kcal: number }; logged: boolean }[]; target: number; width: number }) {
  const H = 170;
  const pad = { l: 34, r: 6, t: 14, b: 22 };
  const max = Math.max(target * 1.3, ...days.map((d) => d.total.kcal)) || 1;
  const step = Math.pow(10, Math.floor(Math.log10(max))) / 2;
  const tickStep = Math.ceil(max / 4 / step) * step;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * tickStep).filter((v) => v <= max * 1.05);
  const iw = width - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const y = (v: number) => pad.t + ih - (v / (ticks[ticks.length - 1] || max)) * ih;
  const bw = iw / days.length;
  const labelEvery = days.length > 10 ? 5 : 1;
  return (
    <Svg width={width} height={H} accessibilityLabel="Calories eaten per day compared to budget">
      {ticks.map((v) => (
        <SvgText key={v} x={pad.l - 6} y={y(v) + 4} fontSize={10} fill={C.ink3} textAnchor="end" fontFamily="DMSans_500Medium">
          {v >= 1000 ? `${fmt(v / 1000)}k` : v}
        </SvgText>
      ))}
      {ticks.map((v) => (
        <Line key={`g${v}`} x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={C.line2} strokeWidth={1} />
      ))}
      {days.map((d, i) => {
        const h = Math.max(0, y(0) - y(d.total.kcal));
        const over = d.total.kcal > target * 1.1;
        const x = pad.l + i * bw + bw * 0.18;
        return (
          <Rect key={d.key} x={x} y={y(d.total.kcal)} width={bw * 0.64} height={d.logged ? Math.max(h, 2) : 2} rx={Math.min(4, bw * 0.2)} fill={d.logged ? (over ? C.bad : C.brand) : C.line} />
        );
      })}
      <Line x1={pad.l} x2={width - pad.r} y1={y(target)} y2={y(target)} stroke={C.ink2} strokeWidth={1.5} strokeDasharray="5 4" />
      {days.map((d, i) =>
        i % labelEvery === 0 || i === days.length - 1 ? (
          <SvgText key={`l${d.key}`} x={pad.l + i * bw + bw / 2} y={H - 6} fontSize={10} fill={C.ink3} textAnchor="middle" fontFamily="DMSans_500Medium">
            {days.length > 10 ? fromKey(d.key).getDate() : fromKey(d.key).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)}
          </SvgText>
        ) : null,
      )}
    </Svg>
  );
}

function WeightChart({ points, target, width }: { points: { day: string; kg: number }[]; target: number | null; width: number }) {
  const H = 160;
  const pad = { l: 34, r: 10, t: 14, b: 22 };
  const vals = points.map((p) => p.kg).concat(target != null ? [target] : []);
  const lo = Math.floor(Math.min(...vals) - 1);
  const hi = Math.ceil(Math.max(...vals) + 1);
  const iw = width - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const t0 = fromKey(points[0].day).getTime();
  const t1 = fromKey(points[points.length - 1].day).getTime();
  const x = (k: string) => pad.l + (t1 === t0 ? iw / 2 : ((fromKey(k).getTime() - t0) / (t1 - t0)) * iw);
  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day)} ${y(p.kg)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi];
  const last = points[points.length - 1];
  const change = last.kg - points[0].kg;
  return (
    <View>
      <Text style={[T.small, { marginBottom: 6 }]}>
        <Text style={{ fontFamily: F.bold, color: C.ink }}>{fmt(last.kg)} kg</Text> now · {change === 0 ? 'no change' : `${change > 0 ? '+' : '−'}${fmt(Math.abs(change))} kg`} since {fromKey(points[0].day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </Text>
      <Svg width={width} height={H} accessibilityLabel="Weight over time">
        {ticks.map((v) => (
          <SvgText key={v} x={pad.l - 6} y={y(v) + 4} fontSize={10} fill={C.ink3} textAnchor="end" fontFamily="DMSans_500Medium">
            {fmt(v)}
          </SvgText>
        ))}
        {ticks.map((v) => (
          <Line key={`g${v}`} x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={C.line2} />
        ))}
        {target != null ? <Line x1={pad.l} x2={width - pad.r} y1={y(target)} y2={y(target)} stroke={C.weight} strokeWidth={1.5} strokeDasharray="5 4" /> : null}
        <Path d={path} stroke={C.weight} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p) => (
          <Circle key={p.day} cx={x(p.day)} cy={y(p.kg)} r={p === last ? 5 : 3} fill={p === last ? C.weight : C.card} stroke={C.weight} strokeWidth={2} />
        ))}
        <SvgText x={pad.l} y={H - 6} fontSize={10} fill={C.ink3} fontFamily="DMSans_500Medium">
          {fromKey(points[0].day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </SvgText>
        <SvgText x={width - pad.r} y={H - 6} fontSize={10} fill={C.ink3} textAnchor="end" fontFamily="DMSans_500Medium">
          {fromKey(last.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </SvgText>
      </Svg>
      {target != null ? <Text style={[T.tiny, { color: C.weight }]}>Dashed line: goal {fmt(target)} kg</Text> : null}
    </View>
  );
}
