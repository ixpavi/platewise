import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Field, Header, Notice, Screen, Segmented, useToast } from '@/components/ui';
import { FOODS, type Category, type Diet, type Food } from '@/data/foods';
import { useStore } from '@/lib/store';
import { C, F, T } from '@/theme';
import { goBack } from '@/lib/nav';

const CAT_ICON: Record<Category, string> = { Food: 'silverware-fork-knife', Drink: 'cup', Dessert: 'cupcake', Other: 'food-variant' };
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

export default function CustomFood() {
  const params = useLocalSearchParams<{ name?: string }>();
  const { state, saveCustomFood } = useStore();
  const toast = useToast();
  const [name, setName] = useState(params.name ?? '');
  const [cat, setCat] = useState<Category>('Food');
  const [diet, setDiet] = useState<Diet>(state.profile?.diet === 'nonveg' ? 'nonveg' : 'veg');
  const [base, setBase] = useState<'g' | 'ml'>('g');
  const [servingLabel, setServingLabel] = useState('1 serving');
  const [serving, setServing] = useState('100');
  const [kcal, setKcal] = useState('');
  const [carb, setCarb] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [fibre, setFibre] = useState('');
  const [sugar, setSugar] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});

  const clean = (t: string) => t.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  const g = num(serving);
  const k = num(kcal);
  const c = num(carb) || 0;
  const p = num(protein) || 0;
  const f = num(fat) || 0;
  const fromMacros = c * 4 + p * 4 + f * 9;
  const mismatch = k > 0 && fromMacros > 0 && Math.abs(k - fromMacros) / Math.max(k, fromMacros) > 0.3;

  const save = () => {
    const e: Record<string, string> = {};
    const nm = name.trim().replace(/\s+/g, ' ');
    if (nm.length < 2) e.name = 'Give the food a name.';
    else if (FOODS.some((x) => x.name.toLowerCase() === nm.toLowerCase())) e.name = `“${nm}” is already in the food list. Search for it instead.`;
    if (!(g >= 1 && g <= 2000)) e.serving = `Enter a serving between 1 and 2000 ${base}.`;
    if (!(k >= 0 && k <= 3000)) e.kcal = 'Enter calories for one serving (0–3000).';
    for (const [key, v] of [['carb', carb], ['protein', protein], ['fat', fat], ['fibre', fibre], ['sugar', sugar]] as const) {
      const n = num(v);
      if (v.trim() && !(n >= 0 && n <= 2000)) e[key] = 'Must be a number of grams.';
    }
    if (g > 0 && c + p + f > g) e.carb = `Carbs, protein and fat add up to more than the ${fmtNum(g)} ${base} serving.`;
    if ((num(sugar) || 0) > c && c > 0) e.sugar = 'Sugar can’t be more than total carbs.';
    setErr(e);
    if (Object.keys(e).length) return;

    const per100 = (v: number) => Math.round((v / g) * 1000) / 10;
    const slug = nm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'food';
    let id = `my-${slug}`;
    for (let i = 2; state.custom[id]; i++) id = `my-${slug}-${i}`;
    const food: Food = {
      id,
      name: nm,
      aliases: nm.toLowerCase(),
      cat,
      icon: CAT_ICON[cat],
      diet,
      base,
      gi: null,
      n: { kcal: Math.round((k / g) * 100), carb: per100(c), protein: per100(p), fat: per100(f), fibre: per100(num(fibre) || 0), sugar: per100(num(sugar) || 0) },
      units: [
        { id: 'serving', label: servingLabel.trim().slice(0, 24) || 'serving', grams: g },
        { id: base, label: base === 'ml' ? 'ml' : 'gram', grams: 1 },
      ],
      custom: true,
    };
    saveCustomFood(food);
    toast(`Saved ${nm}. It now shows up in search.`);
    goBack();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Custom food" onBack={() => goBack()} />
      <View style={{ gap: 14, marginTop: 6 }}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Mom’s moong dal chilla" maxLength={60} error={err.name} autoCapitalize="sentences" />
        <View style={{ gap: 6 }}>
          <Text style={[T.small, { fontFamily: F.semi }]}>Category</Text>
          <Segmented options={['Food', 'Drink', 'Dessert', 'Other'] as const} value={cat} onChange={(v) => (setCat(v), setBase(v === 'Drink' ? 'ml' : 'g'))} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={[T.small, { fontFamily: F.semi }]}>Type</Text>
          <Segmented options={['veg', 'egg', 'nonveg'] as const} value={diet} onChange={setDiet} labels={{ veg: 'Veg', egg: 'Egg', nonveg: 'Non-veg' }} />
        </View>

        <Card style={{ gap: 12 }}>
          <Text style={T.h3}>One serving</Text>
          <Field label="Serving name" value={servingLabel} onChangeText={setServingLabel} placeholder="e.g. 1 bowl, 2 pieces" maxLength={24} />
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <Field style={{ flex: 1 }} label="Serving size" value={serving} onChangeText={(t) => setServing(clean(t))} keyboardType="decimal-pad" suffix={base} error={err.serving} maxLength={6} />
            <View style={{ width: 110, paddingBottom: err.serving ? 24 : 0 }}>
              <Segmented options={['g', 'ml'] as const} value={base} onChange={setBase} />
            </View>
          </View>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={T.h3}>Nutrition per serving</Text>
          <Field label="Calories" value={kcal} onChangeText={(t) => setKcal(clean(t))} keyboardType="decimal-pad" suffix="kcal" error={err.kcal} maxLength={6} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field style={{ flex: 1 }} label="Carbs" value={carb} onChangeText={(t) => setCarb(clean(t))} keyboardType="decimal-pad" suffix="g" error={err.carb} maxLength={6} />
            <Field style={{ flex: 1 }} label="Protein" value={protein} onChangeText={(t) => setProtein(clean(t))} keyboardType="decimal-pad" suffix="g" error={err.protein} maxLength={6} />
            <Field style={{ flex: 1 }} label="Fat" value={fat} onChangeText={(t) => setFat(clean(t))} keyboardType="decimal-pad" suffix="g" error={err.fat} maxLength={6} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field style={{ flex: 1 }} label="Fibre (optional)" value={fibre} onChangeText={(t) => setFibre(clean(t))} keyboardType="decimal-pad" suffix="g" error={err.fibre} maxLength={6} />
            <Field style={{ flex: 1 }} label="Sugar (optional)" value={sugar} onChangeText={(t) => setSugar(clean(t))} keyboardType="decimal-pad" suffix="g" error={err.sugar} maxLength={6} />
          </View>
          {mismatch ? (
            <Notice tone="warn" icon="calculator-variant-outline">
              <Text style={T.small}>
                Those macros add up to about <Text style={{ fontFamily: F.bold, color: C.ink }}>{Math.round(fromMacros)} kcal</Text>, not {Math.round(k)}. Check the label; you can still save.
              </Text>
            </Notice>
          ) : null}
        </Card>
        <Text style={T.tiny}>Custom foods are saved on this phone and appear in search, Foods and photo tagging.</Text>
        <Button label="Save food" onPress={save} />
      </View>
    </Screen>
  );
}

const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
