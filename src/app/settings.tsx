import { useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';
import { Button, Card, Field, Header, Notice, RoundButton, Screen, Section, Segmented, useToast } from '@/components/ui';
import { goBack } from '@/lib/nav';
import { kcalStr, targets } from '@/lib/nutrition';
import { applyReminders, ensurePermission, remindersSupported, testReminder, type Reminders } from '@/lib/reminders';
import { useStore } from '@/lib/store';
import { C, F, T } from '@/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
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
  const [water, setWater] = useState(String((s.waterGoalMl ?? auto.waterMl) / 1000));
  const [steps, setSteps] = useState(String(s.stepGoal));
  const [err, setErr] = useState<Record<string, string>>({});
  const [rem, setRem] = useState<Reminders>(s.reminders);
  const [remState, setRemState] = useState<{ busy?: boolean; denied?: boolean; msg?: string }>({});

  const save = () => {
    const e: Record<string, string> = {};
    const b = budget.trim() ? Number(budget) : null;
    if (b != null && !(b >= 1000 && b <= 5000)) e.budget = 'Pick a budget between 1,000 and 5,000 kcal, or leave it blank for automatic.';
    const w = Number(water);
    if (!(w >= 0.5 && w <= 6)) e.water = 'Enter between 0.5 and 6 litres.';
    const st = Number(steps);
    if (!(st >= 1000 && st <= 50000)) e.steps = 'Enter between 1,000 and 50,000 steps.';
    setErr(e);
    if (Object.keys(e).length) return;
    updateSettings({ calorieOverride: b, waterGoalMl: Math.round(w * 1000), stepGoal: Math.round(st) });
    toast('Settings saved.');
    goBack();
  };

  // Reminders apply immediately, so turning one on asks for permission right away.
  const setReminders = async (next: Reminders) => {
    setRem(next);
    if (!remindersSupported) return;
    setRemState({ busy: true });
    try {
      const anyOn = next.meals || next.water || next.weighIn;
      if (anyOn && !(await ensurePermission())) {
        const off = { ...next, meals: false, water: false, weighIn: false };
        setRem(off);
        updateSettings({ reminders: off });
        await applyReminders(off);
        setRemState({ denied: true });
        return;
      }
      const n = await applyReminders(next);
      updateSettings({ reminders: next });
      setRemState({ msg: n ? `${n} reminder${n === 1 ? '' : 's'} scheduled.` : 'All reminders are off.' });
    } catch {
      setRemState({ msg: 'Couldn’t schedule reminders on this device.' });
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Settings" onBack={() => goBack()} />

      <Section title="Daily goals" style={{ marginTop: 6 }}>
        <Card style={{ gap: 14 }}>
          <Field label="Calorie budget" value={budget} onChangeText={(t) => setBudget(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder={`Automatic: ${kcalStr(auto.kcal)}`} suffix="kcal" error={err.budget} maxLength={4} />
          <Text style={T.tiny}>Leave blank to use the budget calculated from your plan. Set one if a dietitian gave you a number.</Text>
          <Field label="Water goal" value={water} onChangeText={(t) => setWater(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" suffix="litres" error={err.water} maxLength={4} />
          <View style={{ gap: 6 }}>
            <Text style={[T.small, { fontFamily: F.semi }]}>Glass size</Text>
            <Segmented options={['200', '250', '300', '500'] as const} value={String(s.glassMl) as '200'} onChange={(v) => updateSettings({ glassMl: Number(v) })} labels={{ '200': '200 ml', '250': '250 ml', '300': '300 ml', '500': '500 ml' }} />
          </View>
          <Field label="Step goal" value={steps} onChangeText={(t) => setSteps(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" suffix="steps" error={err.steps} maxLength={5} />
          <Button label="Save goals" onPress={save} small />
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
          <Toggle label="Water reminders" sub={`Every 2 hours, ${fmt12(`${String(rem.waterFrom).padStart(2, '0')}:00`)} to ${fmt12(`${rem.waterTo}:00`)}`} value={rem.water} disabled={!remindersSupported || remState.busy} onChange={(v) => setReminders({ ...rem, water: v })} />
          <Toggle label="Weekly weigh-in" sub={`${DAYS[rem.weighDay - 1]} at 8:00 AM`} value={rem.weighIn} disabled={!remindersSupported || remState.busy} onChange={(v) => setReminders({ ...rem, weighIn: v })} />
          {rem.weighIn ? (
            <Segmented options={['1', '2', '3', '4', '5', '6', '7'] as const} value={String(rem.weighDay) as '1'} labels={Object.fromEntries(DAYS.map((d, i) => [String(i + 1), d.slice(0, 2)]))} onChange={(v) => setReminders({ ...rem, weighDay: Number(v) })} />
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
          {remindersSupported && (rem.meals || rem.water || rem.weighIn) ? (
            <Button label="Send a test reminder" icon="bell-ring-outline" kind="ghost" small onPress={() => testReminder().then(() => toast('Test reminder in 3 seconds.'))} />
          ) : null}
        </Card>
      </Section>

      <Section title="Demo">
        <Card style={{ gap: 10 }}>
          <Text style={T.small}>Fill the last six days with realistic meals, water, steps, sleep and weights so Progress has something to show. Today is left untouched.</Text>
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
