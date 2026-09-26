import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bar, Button, Card, Field, Header, Icon, Notice, Screen, Segmented, useToast } from '@/components/ui';
import { addDays, dayKey, fromKey } from '@/lib/dates';
import { ACTIVITY_HINT, bmi, bmiBand, KCAL_PER_KG, kcalStr, targets, type ActivityLevel, type Gender, type Goal, type Profile } from '@/lib/nutrition';
import { useStore } from '@/lib/store';
import { C, F, R, T } from '@/theme';
import { goBack } from '@/lib/nav';

const STEPS = ['goal', 'about', 'body', 'target', 'activity', 'diet', 'plan'] as const;
type Step = (typeof STEPS)[number];

const GOALS: { id: Goal; title: string; body: string; icon: string }[] = [
  { id: 'lose', title: 'Lose weight', body: 'A steady calorie deficit', icon: 'trending-down' },
  { id: 'maintain', title: 'Eat healthier', body: 'Stay at my weight, eat better', icon: 'leaf' },
  { id: 'gain', title: 'Gain weight', body: 'Build up with a surplus', icon: 'trending-up' },
];
const PACES = [0.25, 0.5, 0.75];

export default function Onboarding() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === '1';
  const { state, saveProfile } = useStore();
  const toast = useToast();
  const p0 = state.profile;
  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState<Goal>(p0?.goal ?? 'lose');
  const [gender, setGender] = useState<Gender>(p0?.gender ?? 'Female');
  const [age, setAge] = useState(p0 ? String(p0.age) : '');
  const [hUnit, setHUnit] = useState<'cm' | 'ft'>('cm');
  const [heightCm, setHeightCm] = useState(p0 ? String(p0.heightCm) : '');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [weight, setWeight] = useState(p0 ? String(p0.weightKg) : '');
  const [targetKg, setTargetKg] = useState(p0 ? String(p0.targetKg) : '');
  const [pace, setPace] = useState(p0?.pace ?? 0.5);
  const [activity, setActivity] = useState<ActivityLevel>(p0?.activity ?? 'Light');
  const [diet, setDiet] = useState<Profile['diet']>(p0?.diet ?? 'veg');
  const [err, setErr] = useState<Record<string, string>>({});

  const name = state.account?.name || p0?.name || 'there';
  const cm = hUnit === 'cm' ? Number(heightCm) : Math.round((Number(ft) * 12 + Number(inch || 0)) * 2.54);
  const kg = Number(weight);
  const tgt = goal === 'maintain' ? kg : Number(targetKg);

  const profile: Profile = { name: state.account?.name || p0?.name || 'You', gender, age: Number(age), heightCm: cm, weightKg: kg, targetKg: tgt, activity, goal, pace: goal === 'maintain' ? 0 : pace, diet };
  const plan = useMemo(() => targets(profile, null), [gender, age, cm, kg, tgt, activity, goal, pace]); // eslint-disable-line react-hooks/exhaustive-deps

  const minHealthy = Math.round(18.5 * (cm / 100) ** 2);
  // A realistic first target the user can edit: 5 kg away, but never below a healthy weight.
  const suggested = goal === 'gain' ? Math.round(kg + 4) : Math.max(minHealthy, Math.round(kg - 5));
  const flow = STEPS.filter((s) => s !== 'target' || goal !== 'maintain');
  const i = flow.indexOf(step);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 'about') {
      const a = Number(age);
      if (!age || !Number.isFinite(a)) e.age = 'Enter your age.';
      else if (a < 13 || a > 100) e.age = 'Platewise is for ages 13 to 100.';
    }
    if (step === 'body') {
      if (!(cm >= 100 && cm <= 250)) e.height = hUnit === 'cm' ? 'Enter a height between 100 and 250 cm.' : 'Enter feet and inches, e.g. 5 ft 4 in.';
      if (!(kg >= 25 && kg <= 300)) e.weight = 'Enter a weight between 25 and 300 kg.';
    }
    if (step === 'target') {
      if (!(tgt >= 25 && tgt <= 300)) e.target = 'Enter a target between 25 and 300 kg.';
      else if (goal === 'lose' && tgt >= kg) e.target = `To lose weight, pick a target below ${kg} kg.`;
      else if (goal === 'gain' && tgt <= kg) e.target = `To gain weight, pick a target above ${kg} kg.`;
      else if (goal === 'lose' && tgt < minHealthy) e.target = `${tgt} kg is below a healthy weight for your height (about ${minHealthy} kg or more).`;
    }
    setErr(e);
    return !Object.keys(e).length;
  };

  const next = () => {
    if (!validate()) return;
    if (step === 'plan') {
      saveProfile(profile);
      if (editing) {
        toast('Profile updated. Your targets have been recalculated.');
        goBack();
      } else router.replace('/(tabs)');
      return;
    }
    const to = flow[i + 1];
    if (to === 'target' && !targetKg && (goal === 'gain' || suggested < kg)) setTargetKg(String(suggested));
    setStep(to);
  };
  const back = () => {
    setErr({});
    if (i === 0) {
      if (editing) goBack();
      return;
    }
    setStep(flow[i - 1]);
  };

  // When a safety floor raises the budget, the real pace is slower than the one picked.
  const realPace = goal === 'maintain' ? 0 : Math.round(((Math.abs(plan.tdee - plan.kcal) * 7) / KCAL_PER_KG) * 100) / 100;
  const weeks = goal === 'maintain' || !realPace ? 0 : Math.ceil(Math.abs(kg - tgt) / realPace);
  const reachBy = weeks ? fromKey(addDays(dayKey(), weeks * 7)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const b = cm >= 100 && cm <= 250 && kg >= 25 && kg <= 300 ? bmi(profile) : 0;

  return (
    <Screen edges={['top', 'bottom']} bottomInset={24}>
      <Header title={editing ? 'Edit your plan' : ''} onBack={i > 0 || editing ? back : undefined} right={<Text style={T.tiny}>{i + 1} of {flow.length}</Text>} />
      <Bar value={i + 1} max={flow.length} color={C.brand} height={5} />

      <View style={{ marginTop: 24, gap: 14 }}>
        {step === 'goal' && (
          <>
            <Text style={T.h1}>Hi {name.split(' ')[0]}, what’s your goal?</Text>
            <Text style={[T.body, { color: C.ink2 }]}>We’ll build your daily calorie budget around it.</Text>
            {GOALS.map((g) => (
              <Choice key={g.id} active={goal === g.id} onPress={() => setGoal(g.id)} icon={g.icon} title={g.title} body={g.body} />
            ))}
          </>
        )}

        {step === 'about' && (
          <>
            <Text style={T.h1}>A little about you</Text>
            <Text style={[T.body, { color: C.ink2 }]}>Sex and age change how much energy your body uses at rest.</Text>
            <Text style={styles.lbl}>Sex</Text>
            <Segmented options={['Female', 'Male', 'Other'] as const} value={gender} onChange={setGender} />
            <Field label="Age" value={age} onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={3} placeholder="e.g. 28" suffix="years" error={err.age} />
            {Number(age) >= 13 && Number(age) < 18 ? <Notice tone="warn">Under 18, calorie targets are a rough guide. Talk to a doctor before dieting.</Notice> : null}
          </>
        )}

        {step === 'body' && (
          <>
            <Text style={T.h1}>Your height and weight</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.lbl}>Height</Text>
              <View style={{ width: 130 }}>
                <Segmented options={['cm', 'ft'] as const} value={hUnit} onChange={setHUnit} />
              </View>
            </View>
            {hUnit === 'cm' ? (
              <Field value={heightCm} onChangeText={(t) => setHeightCm(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="e.g. 165" suffix="cm" error={err.height} maxLength={5} />
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field style={{ flex: 1 }} value={ft} onChangeText={(t) => setFt(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="5" suffix="ft" maxLength={1} error={err.height} />
                <Field style={{ flex: 1 }} value={inch} onChangeText={(t) => setInch(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="4" suffix="in" maxLength={2} />
              </View>
            )}
            <Field label="Current weight" value={weight} onChangeText={(t) => setWeight(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="e.g. 68" suffix="kg" error={err.weight} maxLength={5} />
            {b ? (
              <Notice icon="human">
                <Text style={T.small}>
                  Your BMI is <Text style={{ fontFamily: F.bold, color: C.ink }}>{b.toFixed(1)}</Text> ({bmiBand(b).label}, using Asian cut-offs).
                </Text>
              </Notice>
            ) : null}
          </>
        )}

        {step === 'target' && (
          <>
            <Text style={T.h1}>{goal === 'lose' ? 'Where do you want to get to?' : 'What weight are you aiming for?'}</Text>
            <Field label="Target weight" value={targetKg} onChangeText={(t) => setTargetKg(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder={`e.g. ${suggested}`} suffix="kg" error={err.target} maxLength={5} />
            <Text style={styles.lbl}>Weekly pace</Text>
            {PACES.map((pc) => (
              <Choice key={pc} active={pace === pc} onPress={() => setPace(pc)} icon={pc === 0.25 ? 'tortoise' : pc === 0.5 ? 'walk' : 'run-fast'} title={`${pc} kg a week`} body={pc === 0.25 ? 'Gentle, easiest to keep up' : pc === 0.5 ? 'Recommended' : 'Faster, needs more discipline'} />
            ))}
          </>
        )}

        {step === 'activity' && (
          <>
            <Text style={T.h1}>How active is a normal day?</Text>
            {(['Sedentary', 'Light', 'Moderate', 'Active'] as const).map((a) => (
              <Choice key={a} active={activity === a} onPress={() => setActivity(a)} icon={{ Sedentary: 'sofa-outline', Light: 'walk', Moderate: 'bike', Active: 'weight-lifter' }[a]} title={a} body={ACTIVITY_HINT[a]} />
            ))}
          </>
        )}

        {step === 'diet' && (
          <>
            <Text style={T.h1}>How do you eat?</Text>
            <Text style={[T.body, { color: C.ink2 }]}>We use this to suggest foods and filter the food list.</Text>
            <Choice active={diet === 'veg'} onPress={() => setDiet('veg')} icon="leaf" title="Vegetarian" body="No meat, fish or eggs" />
            <Choice active={diet === 'egg'} onPress={() => setDiet('egg')} icon="egg-outline" title="Eggetarian" body="Vegetarian plus eggs" />
            <Choice active={diet === 'nonveg'} onPress={() => setDiet('nonveg')} icon="food-drumstick-outline" title="Non-vegetarian" body="Meat, fish and eggs" />
          </>
        )}

        {step === 'plan' && (
          <>
            <Text style={T.h1}>Your daily plan</Text>
            <Card style={{ backgroundColor: C.brandDeep, gap: 4 }}>
              <Text style={[T.label, { color: 'rgba(255,255,255,0.6)' }]}>Calorie budget</Text>
              <Text style={[T.num, { color: '#fff', fontSize: 52 }]}>
                {kcalStr(plan.kcal)} <Text style={{ fontFamily: F.medium, fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>kcal / day</Text>
              </Text>
              <Text style={[T.small, { color: 'rgba(255,255,255,0.75)' }]}>
                You burn about {kcalStr(plan.tdee)} kcal a day.{' '}
                {goal === 'lose' ? `Eating ${kcalStr(plan.tdee - plan.kcal)} less loses about ${realPace} kg a week.` : goal === 'gain' ? `Eating ${kcalStr(plan.kcal - plan.tdee)} more gains about ${realPace} kg a week.` : 'This keeps your weight steady.'}
              </Text>
            </Card>
            {plan.floorHit ? <Notice tone="warn">We raised your budget to a safe minimum. Losing faster than this isn’t recommended without medical supervision.</Notice> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Macro label="Carbs" g={plan.carb} color={C.carb} />
              <Macro label="Protein" g={plan.protein} color={C.protein} />
              <Macro label="Fat" g={plan.fat} color={C.fat} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Mini icon="barley" color={C.fibre} label="Fibre" value={`${plan.fibre} g`} />
            </View>
            {weeks ? (
              <Notice icon="flag-checkered">
                <Text style={T.small}>
                  At this pace you’ll reach <Text style={{ fontFamily: F.bold, color: C.ink }}>{tgt} kg</Text> around <Text style={{ fontFamily: F.bold, color: C.ink }}>{reachBy}</Text> ({weeks} weeks).
                </Text>
              </Notice>
            ) : null}
            <Text style={T.tiny}>Budget uses the Mifflin–St Jeor equation. It’s an estimate; adjust it any time in Settings.</Text>
          </>
        )}
      </View>

      <Button label={step === 'plan' ? (editing ? 'Save plan' : 'Start tracking') : 'Continue'} onPress={next} style={{ marginTop: 28 }} />
    </Screen>
  );
}

function Choice({ active, onPress, icon, title, body }: { active: boolean; onPress: () => void; icon: string; title: string; body: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: active }} style={[styles.choice, active && styles.choiceOn]}>
      <View style={[styles.choiceIcon, active && { backgroundColor: C.brand }]}>
        <Icon name={icon} size={22} color={active ? '#fff' : C.ink2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={T.h3}>{title}</Text>
        <Text style={T.small}>{body}</Text>
      </View>
      <Icon name={active ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={active ? C.brand : C.line} />
    </Pressable>
  );
}
function Macro({ label, g, color }: { label: string; g: number; color: string }) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 2 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={[T.num, { fontSize: 22, marginTop: 6 }]}>{g} g</Text>
      <Text style={T.small}>{label}</Text>
    </Card>
  );
}
function Mini({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  return (
    <Card style={{ flex: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon name={icon} size={22} color={color} />
      <View>
        <Text style={[T.h3]}>{value}</Text>
        <Text style={T.small}>{label}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  lbl: { fontFamily: F.semi, fontSize: 13, color: C.ink2 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: R.lg, padding: 14, borderWidth: 1.5, borderColor: C.line },
  choiceOn: { borderColor: C.brand, backgroundColor: '#F6FBF7' },
  choiceIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.line2, alignItems: 'center', justifyContent: 'center' },
});
