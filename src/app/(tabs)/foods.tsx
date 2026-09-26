import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, DietMark, Empty, FoodIcon, Icon, ScoreBadge } from '@/components/ui';
import { ALL_FOODS, CATEGORY_TINT, defaultPortion, type Category, type Food } from '@/data/foods';
import { healthScore, kcalStr, scale } from '@/lib/nutrition';
import { searchFoods } from '@/lib/search';
import { useStore } from '@/lib/store';
import { C, F, R, T } from '@/theme';

type Filter = 'All' | 'Favourites' | Category;
type Sort = 'Name' | 'Calories' | 'Protein' | 'Health';
const CATS: { id: Category; label: string; icon: string; blurb: string }[] = [
  { id: 'Food', label: 'Food', icon: 'silverware-fork-knife', blurb: 'Meals, breads, fruit' },
  { id: 'Drink', label: 'Drinks', icon: 'cup', blurb: 'Chai, juices, milk' },
  { id: 'Dessert', label: 'Desserts', icon: 'cupcake', blurb: 'Mithai, cakes' },
  { id: 'Other', label: 'Other', icon: 'peanut', blurb: 'Nuts, spreads, extras' },
];

export default function Foods() {
  const { state, toggleFav } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [sort, setSort] = useState<Sort>('Name');
  const [vegOnly, setVegOnly] = useState(state.profile?.diet === 'veg');

  const all = useMemo(() => [...Object.values(state.custom), ...ALL_FOODS], [state.custom]);
  const list = useMemo(() => {
    let pool: Food[] = filter === 'All' ? all : filter === 'Favourites' ? all.filter((f) => state.favs.includes(f.id)) : all.filter((f) => f.cat === filter);
    if (vegOnly) pool = pool.filter((f) => f.diet === 'veg');
    const found = searchFoods(q, pool);
    if (q.trim()) return found;
    const key: Record<Sort, (f: Food) => number | string> = {
      Name: (f) => f.name,
      Calories: (f) => -scale(f, defaultPortion(f).grams).kcal,
      Protein: (f) => -(f.n.protein / Math.max(f.n.kcal, 1)),
      Health: (f) => -healthScore(f),
    };
    // Work out each food's sort value once: with thousands of foods, doing it per comparison is slow.
    const k = key[sort];
    return found
      .map((f) => ({ f, v: k(f) }))
      .sort((a, b) => (typeof a.v === 'string' ? a.v.localeCompare(b.v as string) : (a.v as number) - (b.v as number)))
      .map((x) => x.f);
  }, [all, filter, q, sort, state.favs, vegOnly]);

  const header = (
    <View>
      <Text style={[T.h1, { paddingTop: 14 }]}>Foods</Text>
      <Text style={[T.small, { marginBottom: 12 }]}>{all.length} foods with nutrition per portion</Text>
      <View style={styles.search}>
        <Icon name="magnify" size={22} color={C.ink3} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search dal, paneer, chai…" placeholderTextColor={C.ink3} style={styles.searchInput} returnKeyType="search" maxLength={60} accessibilityLabel="Search foods" />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
            <Icon name="close-circle" size={20} color={C.ink3} />
          </Pressable>
        ) : null}
      </View>
      {!q ? (
        <View style={styles.cats}>
          {CATS.map((c) => {
            const on = filter === c.id;
            return (
              <Pressable key={c.id} onPress={() => setFilter(on ? 'All' : c.id)} style={[styles.cat, { backgroundColor: CATEGORY_TINT[c.id] }, on && styles.catOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Icon name={c.icon} size={24} color={C.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={T.h3}>{c.label}</Text>
                  <Text style={T.tiny} numberOfLines={1}>
                    {all.filter((f) => f.cat === c.id).length} · {c.blurb}
                  </Text>
                </View>
                {on ? <Icon name="check-circle" size={20} color={C.brand} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 12 }}>
        <Chip label="Favourites" icon="star" active={filter === 'Favourites'} onPress={() => setFilter(filter === 'Favourites' ? 'All' : 'Favourites')} />
        <Chip label="Veg only" icon="leaf" active={vegOnly} onPress={() => setVegOnly(!vegOnly)} tone={C.veg} />
        {!q
          ? (['Name', 'Calories', 'Protein', 'Health'] as Sort[]).map((s) => (
              <Chip key={s} label={s === 'Name' ? 'A–Z' : s === 'Calories' ? 'Most kcal' : s === 'Protein' ? 'Protein-rich' : 'Healthiest'} active={sort === s} onPress={() => setSort(s)} tone={C.brand} />
            ))
          : null}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <FlatList
        data={list}
        keyExtractor={(f) => f.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={
          filter === 'Favourites' && !q ? (
            <Empty icon="star-outline" title="No favourites yet" body="Tap the star on any food to keep it here." />
          ) : (
            <Empty icon="magnify" title="No foods found" body={q ? `Nothing matches “${q.trim()}”. Try a shorter or more common name.` : 'Try another filter.'} action={vegOnly ? 'Show non-veg too' : undefined} onAction={() => setVegOnly(false)} />
          )
        }
        renderItem={({ item: f }) => {
          const p = defaultPortion(f);
          const n = scale(f, p.grams);
          const fav = state.favs.includes(f.id);
          return (
            <View style={styles.row}>
              <Pressable onPress={() => router.push({ pathname: '/food/[id]', params: { id: f.id } })} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${f.name}, ${kcalStr(n.kcal)} kcal per ${p.label}`}>
              <FoodIcon food={f} size={46} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <DietMark diet={f.diet} />
                  <Text style={[T.body, { fontFamily: F.semi, flexShrink: 1 }]} numberOfLines={1}>
                    {f.name}
                  </Text>
                </View>
                <Text style={T.small}>
                  {kcalStr(n.kcal)} kcal · {p.label} · P {Math.round(n.protein)} g
                </Text>
              </View>
              </Pressable>
              <Pressable onPress={() => toggleFav(f.id)} hitSlop={8} style={{ padding: 4 }} accessibilityLabel={fav ? 'Remove favourite' : 'Add favourite'}>
                <Icon name={fav ? 'star' : 'star-outline'} size={20} color={fav ? C.warn : C.ink3} />
              </Pressable>
              <ScoreBadge score={healthScore(f)} size="sm" />
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: R.md, paddingHorizontal: 14, minHeight: 50, borderWidth: 1, borderColor: C.line },
  searchInput: { flex: 1, fontFamily: F.medium, fontSize: 16, color: C.ink, paddingVertical: 10, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  cat: { width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: R.lg, padding: 14, borderWidth: 1.5, borderColor: 'transparent' },
  catOn: { borderColor: C.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line2 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
