import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Field, Header, Icon, Notice, Screen, Segmented, useToast } from '@/components/ui';
import { FOODS, type Category, type Diet, type Food } from '@/data/foods';
import { aiAvailable, AiError, labelPhoto, readLabel, type LabelRead } from '@/lib/ai';
import { useStore } from '@/lib/store';
import { C, F, T } from '@/theme';
import { goBack } from '@/lib/nav';

const CAT_ICON: Record<Category, string> = { Food: 'silverware-fork-knife', Drink: 'cup', Dessert: 'cupcake', Other: 'food-variant' };
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

export default function CustomFood() {
  const params = useLocalSearchParams<{ name?: string; code?: string }>();
  // Coming from a barcode that wasn't found: save under that barcode so the next scan opens it.
  const code = /^\d{8,14}$/.test(params.code ?? '') ? params.code! : null;
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
  const [fromLabel, setFromLabel] = useState(false);
  const [ai, setAi] = useState<{ busy?: boolean; msg?: string; ok?: boolean }>({});

  const fill = (r: LabelRead) => {
    if (r.name && !name.trim()) setName(r.name);
    const b: 'g' | 'ml' = r.isDrink ? 'ml' : 'g';
    setBase(b);
    setCat(r.isDrink ? 'Drink' : cat === 'Drink' ? 'Food' : cat);
    if (r.diet) setDiet(r.diet);
    const sv = r.servingGrams ?? 100;
    setServing(fmtNum(sv));
    setServingLabel(r.servingGrams ? r.servingLabel || '1 serving' : `100 ${b}`);
    const perServing = (v: number) => fmtNum(Math.round(v * sv) / 100);
    setKcal(String(Math.round((r.per100.kcal * sv) / 100)));
    setCarb(perServing(r.per100.carb));
    setProtein(perServing(r.per100.protein));
    setFat(perServing(r.per100.fat));
    setFibre(r.per100.fibre ? perServing(r.per100.fibre) : '');
    setSugar(r.per100.sugar ? perServing(r.per100.sugar) : '');
    setFromLabel(true);
    setErr({});
  };

  const scan = async (source: 'camera' | 'gallery') => {
    if (ai.busy) return;
    setAi({ busy: true });
    try {
      const photo = await labelPhoto(source);
      if (!photo) return setAi({});
      fill(await readLabel(photo));
      setAi({ ok: true, msg: 'Filled in from the label. Check the numbers against the pack, then save.' });
    } catch (e) {
      setAi({ msg: e instanceof AiError ? e.message : 'Couldn’t read that photo. Try again.' });
    }
  };

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
    let id = code ? `bc-${code}` : `my-${slug}`;
    for (let i = 2; !code && state.custom[id]; i++) id = `my-${slug}-${i}`;
    const food: Food = {
      id,
      name: nm,
      aliases: code ? `${nm.toLowerCase()} ${code}` : nm.toLowerCase(),
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
      ...(fromLabel || code ? { src: 'label' as const } : {}),
    };
    saveCustomFood(food);
    toast(code ? `Saved ${nm}. Scanning this barcode now opens it.` : `Saved ${nm}. It now shows up in search.`);
    goBack();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Custom food" onBack={() => goBack()} />
      <View style={{ gap: 14, marginTop: 6 }}>
        {aiAvailable() ? (
          <Card style={{ gap: 10, backgroundColor: C.coachSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="text-recognition" size={22} color={C.coach} />
              <Text style={[T.h3, { flex: 1 }]}>Fill it in from the label</Text>
            </View>
            <Text style={T.small}>Photograph the nutrition table on the pack. AI reads it and fills in the form for you to check.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Take photo" icon="camera-outline" small style={{ flex: 1 }} loading={ai.busy} onPress={() => scan('camera')} />
              <Button label="Choose photo" icon="image-outline" kind="ghost" small style={{ flex: 1 }} disabled={ai.busy} onPress={() => scan('gallery')} />
            </View>
            {ai.msg ? (
              <Notice tone={ai.ok ? 'info' : 'warn'} icon={ai.ok ? 'check-circle-outline' : 'alert-circle-outline'}>
                {ai.msg}
              </Notice>
            ) : null}
            <Text style={T.tiny}>The photo is sent to Google Gemini to read the label and isn’t kept.</Text>
          </Card>
        ) : null}
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
