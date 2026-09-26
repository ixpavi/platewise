import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Header, Icon, RoundButton, Screen, Section, Stepper, tap, useToast } from '@/components/ui';
import { ACTIVITIES, ACTIVITY_BY_ID } from '@/data/activities';
import { dayKey, isToday, relativeDay, stampFor } from '@/lib/dates';
import { kcalStr } from '@/lib/nutrition';
import { useStore } from '@/lib/store';
import { C, F, R, T } from '@/theme';
import { goBack } from '@/lib/nav';

export default function Workout() {
  const params = useLocalSearchParams<{ day?: string }>();
  const day = params.day || dayKey();
  const { state, addWorkout, removeWorkout, day: getDay } = useStore();
  const toast = useToast();
  const [id, setId] = useState('walk');
  const [minutes, setMinutes] = useState(30);
  const kg = state.profile?.weightKg ?? 65;
  const a = ACTIVITY_BY_ID[id];
  const kcal = Math.round(a.met * kg * (minutes / 60));
  const list = getDay(day).workouts;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Log workout" subtitle={isToday(day) ? undefined : relativeDay(day)} onBack={() => goBack()} />
      <View style={styles.grid}>
        {ACTIVITIES.map((x) => {
          const on = x.id === id;
          return (
            <Pressable key={x.id} onPress={() => (tap(), setId(x.id))} style={[styles.act, on && styles.actOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
              <Icon name={x.icon} size={24} color={on ? '#fff' : C.workout} />
              <Text style={[T.tiny, { color: on ? '#fff' : C.ink, fontFamily: F.semi, textAlign: 'center' }]} numberOfLines={2}>
                {x.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ gap: 12, marginTop: 14 }}>
        <Text style={T.h3}>Duration</Text>
        <Stepper value={minutes} onChange={setMinutes} step={5} min={5} max={300} format={(v) => `${v} min`} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={T.small}>Estimated burn at {kg} kg</Text>
          <Text style={[T.num, { fontSize: 26, color: C.workout }]}>{kcalStr(kcal)} kcal</Text>
        </View>
        <Button
          label={`Add ${a.name.toLowerCase()}`}
          onPress={() => {
            addWorkout(day, { activityId: id, minutes, kcal, t: stampFor(day) });
            tap('success');
            toast(`Logged ${minutes} min of ${a.name.toLowerCase()} · ${kcal} kcal`);
            goBack();
          }}
        />
        <Text style={T.tiny}>Burned calories are added to your budget for the day. Estimates use MET values from the Compendium of Physical Activities.</Text>
      </Card>

      {list.length ? (
        <Section title={isToday(day) ? 'Today' : relativeDay(day)}>
          <Card style={{ paddingVertical: 4 }}>
            {list.map((w, i) => (
              <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: C.line2 }}>
                <Icon name={ACTIVITY_BY_ID[w.activityId]?.icon ?? 'run'} size={22} color={C.workout} />
                <Text style={[T.body, { flex: 1 }]}>
                  {ACTIVITY_BY_ID[w.activityId]?.name ?? 'Activity'} · {w.minutes} min
                </Text>
                <Text style={[T.body, { fontFamily: F.bold }]}>{w.kcal} kcal</Text>
                <RoundButton
                  icon="close"
                  label="Remove"
                  size={32}
                  bg={C.line2}
                  color={C.ink2}
                  onPress={() => {
                    const r = removeWorkout(day, w.id);
                    if (r) toast('Workout removed.', { label: 'Undo', run: () => addWorkout(day, { activityId: r.activityId, minutes: r.minutes, kcal: r.kcal, t: r.t }) });
                  }}
                />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  act: { width: '23%', flexGrow: 1, aspectRatio: 1, maxHeight: 96, borderRadius: R.md, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 6, borderWidth: 1, borderColor: C.line },
  actOn: { backgroundColor: C.workout, borderColor: C.workout },
});
