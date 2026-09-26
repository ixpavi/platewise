import { useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { Button, Card, Field, Header, Notice, RoundButton, Screen, Section, useToast } from '@/components/ui';
import { goBack } from '@/lib/nav';
import { kcalStr, targets } from '@/lib/nutrition';
import { applyReminders, ensurePermission, remindersSupported, testReminder, type Reminders } from '@/lib/reminders';
import { useStore } from '@/lib/store';
import { C, F, T } from '@/theme';

const fmt12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const shift = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export default function Settings() {
  const { state, updateSettings, loadSample } = useStore();
  const toast = useToast();
  const s = state.settings;
  const auto = targets(state.profile, null);
  const [budget, setBudget] = useState(s.calorieOverride ? String(s.calorieOverride) : '');
  const [err, setErr] = useState('');
  const [rem, setRem] = useState<Reminders>(s.reminders);
  const [remState, setRemState] = useState<{ busy?: boolean; denied?: boolean; msg?: string }>({});

  const save = () => {
    const b = budget.trim() ? Number(budget) : null;
    if (b != null && !(b >= 1000 && b <= 5000)) return setErr('Pick a budget between 1,000 and 5,000 kcal, or leave it blank for automatic.');
    setErr('');
    updateSettings({ calorieOverride: b });
    toast('Budget saved.');
    goBack();
  };

  // Reminders apply immediately, so turning them on asks for permission right away.
  const setReminders = async (next: Reminders) => {
    setRem(next);
    if (!remindersSupported) return;
    setRemState({ busy: true });
    try {
      if (next.meals && !(await ensurePermission())) {
        const off = { ...next, meals: false };
        setRem(off);
        updateSettings({ reminders: off });
        await applyReminders(off);
        setRemState({ denied: true });
        return;
      }
      const n = await applyReminders(next);
      updateSettings({ reminders: next });
      setRemState({ msg: n ? `${n} reminders scheduled.` : 'Reminders are off.' });
    } catch {
      setRemState({ msg: 'Couldn’t schedule reminders on this device.' });
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Settings" onBack={() => goBack()} />

      <Section title="Daily calorie budget" style={{ marginTop: 6 }}>
        <Card style={{ gap: 14 }}>
          <Field label="Calorie budget" value={budget} onChangeText={(t) => setBudget(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder={`Automatic: ${kcalStr(auto.kcal)}`} suffix="kcal" error={err} maxLength={4} />
          <Text style={T.tiny}>Leave blank to use the budget calculated from your plan. Set one if a dietitian gave you a number.</Text>
          <Button label="Save budget" onPress={save} small />
        </Card>
      </Section>

      <Section title="Reminders">
        <Card style={{ gap: 14 }}>
          {!remindersSupported ? (
            <Notice icon="cellphone">Reminders work in the phone app. Browsers can’t send them while the page is closed.</Notice>
          ) : null}
          <Toggle label="Meal reminders" sub="Breakfast, lunch and dinner" value={rem.meals} disabled={!remindersSupported || remState.busy} onChange={(v) => setReminders({ ...rem, meals: v })} />
          {rem.meals ? (
            <View style={{ gap: 8, paddingLeft: 4 }}>
              {(['breakfast', 'lunch', 'dinner'] as const).map((k) => (
                <TimeRow key={k} label={k[0].toUpperCase() + k.slice(1)} value={rem[k]} onChange={(v) => setReminders({ ...rem, [k]: v })} />
              ))}
            </View>
          ) : null}
          {remState.denied ? (
            <Notice tone="warn" icon="bell-off-outline">
              <Text style={T.small}>
                Notifications are turned off for Platewise.{' '}
                <Text onPress={() => Linking.openSettings()} style={{ color: C.brand, fontFamily: F.bold }}>
                  Open Settings
                </Text>{' '}
                to allow them, then try again.
              </Text>
            </Notice>
          ) : remState.msg ? (
            <Text style={T.tiny}>{remState.msg}</Text>
          ) : null}
          {remindersSupported && rem.meals ? (
            <Button label="Send a test reminder" icon="bell-ring-outline" kind="ghost" small onPress={() => testReminder().then(() => toast('Test reminder in 3 seconds.'))} />
          ) : null}
        </Card>
      </Section>

      <Section title="Demo">
        <Card style={{ gap: 10 }}>
          <Text style={T.small}>Fill the last six days with realistic meals so Progress has something to show. Today is left untouched.</Text>
          <Button
            label="Load a sample week"
            kind="ghost"
            small
            onPress={() => {
              loadSample();
              toast('Sample week loaded. Check Progress.');
            }}
          />
        </Card>
      </Section>
    </Screen>
  );
}

function Toggle({ label, sub, value, onChange, disabled }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={T.h3}>{label}</Text>
        <Text style={T.small}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: C.brand, false: C.line }} thumbColor="#fff" accessibilityLabel={label} />
    </View>
  );
}

function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={[T.body, { flex: 1 }]}>{label}</Text>
      <RoundButton icon="minus" label={`${label} earlier`} size={32} bg={C.line2} onPress={() => onChange(shift(value, -15))} />
      <Text style={{ fontFamily: F.bold, minWidth: 76, textAlign: 'center' }}>{fmt12(value)}</Text>
      <RoundButton icon="plus" label={`${label} later`} size={32} bg={C.line2} onPress={() => onChange(shift(value, 15))} />
    </View>
  );
}
