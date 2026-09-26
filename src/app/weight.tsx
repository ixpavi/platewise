import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Empty, Header, Notice, RoundButton, Screen, Section, Stepper, useToast } from '@/components/ui';
import { dayKey, relativeDay } from '@/lib/dates';
import { bmi, bmiBand, fmtKg } from '@/lib/nutrition';
import { useStore } from '@/lib/store';
import { C, F, T } from '@/theme';
import { goBack } from '@/lib/nav';

export default function Weight() {
  const { state, logWeight, removeWeight } = useStore();
  const toast = useToast();
  const p = state.profile!;
  const today = dayKey();
  const todays = state.weights.find((w) => w.day === today);
  const last = state.weights[state.weights.length - 1];
  const [kg, setKg] = useState(todays?.kg ?? last?.kg ?? p.weightKg);
  const prev = [...state.weights].reverse().find((w) => w.day !== today);
  const diff = prev ? kg - prev.kg : 0;
  const b = bmi({ ...p, weightKg: kg });

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Weight" onBack={() => goBack()} />
      <Card style={{ gap: 14, marginTop: 6 }}>
        <Text style={T.h3}>{todays ? "Update today's weight" : "Today's weight"}</Text>
        <Stepper value={kg} onChange={setKg} step={0.1} min={25} max={300} format={(v) => `${v.toFixed(1)} kg`} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={T.small}>
            BMI {b.toFixed(1)} · {bmiBand(b).label}
          </Text>
          {prev ? (
            <Text style={[T.small, { fontFamily: F.bold, color: diff === 0 ? C.ink2 : (diff < 0) === (p.goal !== 'gain') ? C.good : C.warn }]}>
              {diff === 0 ? 'Same as last time' : `${diff > 0 ? '+' : '−'}${fmtKg(Math.abs(diff))} kg vs ${relativeDay(prev.day).toLowerCase()}`}
            </Text>
          ) : null}
        </View>
        {prev && Math.abs(diff) > 3 ? <Notice tone="warn">That’s a big change from last time. Double-check the number; day-to-day water shifts are usually under 1.5 kg.</Notice> : null}
        <Button
          label={todays ? 'Update' : 'Save'}
          onPress={() => {
            logWeight(today, Math.round(kg * 10) / 10);
            toast(`Saved ${kg.toFixed(1)} kg.`);
            goBack();
          }}
        />
      </Card>
      <Text style={[T.tiny, { marginTop: 10 }]}>Tip: weigh yourself in the morning after the toilet, before eating, once or twice a week.</Text>

      <Section title="History">
        {state.weights.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {[...state.weights].reverse().map((w, i, arr) => (
              <View key={w.day} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: C.line2 }}>
                <Text style={[T.body, { flex: 1 }]}>{relativeDay(w.day)}</Text>
                <Text style={[T.body, { fontFamily: F.bold, marginRight: 12 }]}>{fmtKg(w.kg)} kg</Text>
                <RoundButton
                  icon="close"
                  label={`Delete ${relativeDay(w.day)}`}
                  size={32}
                  bg={C.line2}
                  color={C.ink2}
                  onPress={() => {
                    removeWeight(w.day);
                    toast('Entry deleted.', { label: 'Undo', run: () => logWeight(w.day, w.kg) });
                  }}
                />
              </View>
            ))}
          </Card>
        ) : (
          <Empty icon="scale-bathroom" title="No entries yet" />
        )}
      </Section>
    </Screen>
  );
}
