import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, DietMark, Empty, FoodIcon, Header, Icon, RoundButton, tap, useToast } from '@/components/ui';
import { ALL_FOODS, defaultPortion, type Category, type Food } from '@/data/foods';
import { pickBus } from '@/lib/bus';
import { dayKey, isToday, relativeDay, stampFor } from '@/lib/dates';
import { kcalStr, scale } from '@/lib/nutrition';
import { searchFoods } from '@/lib/search';
import { MEALS, useStore, type Meal } from '@/lib/store';
import { useMeals } from '@/lib/summary';
import { C, F, R, T } from '@/theme';
import { goBack } from '@/lib/nav';

type Filter = 'All' | 'Favourites' | Category;
const FILTERS: Filter[] = ['All', 'Favourites', 'Food', 'Drink', 'Dessert', 'Other'];

export default function LogFood() {
  const params = useLocalSearchParams<{ meal?: string; day?: string; mode?: string; q?: string }>();
  const pickMode = params.mode === 'pick';
  const day = params.day || dayKey();
  const myMeals = useMeals();
  const [meal, setMeal] = useState<Meal>((MEALS as readonly string[]).includes(params.meal ?? '') ? (params.meal as Meal) : myMeals.now);
  const [q, setQ] = useState(params.q ?? '');
  const [filter, setFilter] = useState<Filter>('All');
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const { state, addEntries, removeEntry, toggleFav } = useStore();
  const toast = useToast();

  useEffect(
    () => () => {
      if (pickMode && pickBus.active) pickBus.cancel();
    },
    [pickMode],
  );

  const all = useMemo(() => [...Object.values(state.custom), ...ALL_FOODS], [state.custom]);
  const pool = useMemo(() => {
    if (filter === 'Favourites') return state.favs.map((id) => all.find((f) => f.id === id)).filter((f): f is Food => !!f);
    if (filter === 'All') return all;
    return all.filter((f) => f.cat === filter);
  }, [all, filter, state.favs]);
  const results = useMemo(() => searchFoods(q, pool), [q, pool]);
  const recents = useMemo(() => state.recents.map((id) => all.find((f) => f.id === id)).filter((f): f is Food => !!f).slice(0, 8), [state.recents, all]);
  const query = q.trim();

  const open = (f: Food) => {
    if (pickMode) {
      pickBus.resolve({ foodId: f.id });
      goBack();
      return;
    }
    router.push({ pathname: '/food/[id]', params: { id: f.id, day, meal } });
  };

  const quickAdd = (f: Food) => {
    const p = defaultPortion(f);
    const [e] = addEntries(day, [{ foodId: f.id, unitId: p.unit.id, qty: p.qty, grams: p.grams, meal, t: stampFor(day), source: 'search' }]);
    tap('success');
    setAdded((a) => [...a, { id: e.id, name: f.name }]);
    toast(`Added ${p.label} ${f.name} to ${meal.toLowerCase()}.`, {
      label: 'Undo',
      run: () => {
        removeEntry(day, e.id);
        setAdded((a) => a.filter((x) => x.id !== e.id));
      },
    });
  };

  const Row = ({ f }: { f: Food }) => {
    const p = defaultPortion(f);
    const kcal = scale(f, p.grams).kcal;
    const fav = state.favs.includes(f.id);
    return (
      <View style={styles.row}>
        <Pressable onPress={() => open(f)} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`${f.name}, ${kcalStr(kcal)} kcal per ${p.label}`}>
        <FoodIcon food={f} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <DietMark diet={f.diet} />
            <Text style={[T.body, { fontFamily: F.semi, flexShrink: 1 }]} numberOfLines={1}>
              {f.name}
            </Text>
            {f.custom ? <Icon name="account-edit-outline" size={14} color={C.coach} /> : null}
          </View>
          <Text style={T.small}>
            {p.label}
            {p.qty === 1 ? ` (${p.grams} ${f.base})` : ''} · {kcalStr(kcal)} kcal
          </Text>
        </View>
        </Pressable>
        {!pickMode ? (
          <>
            <Pressable onPress={() => toggleFav(f.id)} hitSlop={8} accessibilityLabel={fav ? 'Remove favourite' : 'Add favourite'} style={{ padding: 4 }}>
              <Icon name={fav ? 'star' : 'star-outline'} size={20} color={fav ? C.warn : C.ink3} />
            </Pressable>
            <RoundButton icon="plus" label={`Quick add ${f.name}`} bg={C.brandSoft} color={C.brand} size={36} onPress={() => quickAdd(f)} />
          </>
        ) : (
          <Icon name="chevron-right" size={22} color={C.ink3} />
        )}
      </View>
    );
  };

  const customCard = (
    <View style={styles.customCard}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Icon name="plus-box-outline" size={22} color={C.brand} />
        <Text style={[T.body, { flex: 1 }]}>{query && !results.length ? `No match for “${query}”.` : 'Can’t find your food?'} Add it with the values from its label or recipe.</Text>
      </View>
      <Button label="Create a custom food" kind="soft" small onPress={() => router.push({ pathname: '/custom-food', params: { name: query } })} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 18 }}>
        <Header
          title={pickMode ? 'Choose a food' : `Add to ${meal}`}
          subtitle={pickMode ? undefined : isToday(day) ? undefined : relativeDay(day)}
          onBack={() => goBack()}
          right={pickMode ? undefined : <RoundButton icon="barcode-scan" label="Scan a barcode" onPress={() => router.push({ pathname: '/barcode', params: { meal, day } })} />}
        />
        {!pickMode ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
            {myMeals.options(meal).map((m) => (
              <Chip key={m} label={m} active={m === meal} onPress={() => setMeal(m)} tone={C.brand} />
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.search}>
          <Icon name="magnify" size={22} color={C.ink3} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search dal, roti, paneer, chai…"
            placeholderTextColor={C.ink3}
            style={styles.searchInput}
            autoFocus={!params.q}
            returnKeyType="search"
            maxLength={60}
            accessibilityLabel="Search foods"
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Clear search">
              <Icon name="close-circle" size={20} color={C.ink3} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 10 }}>
          {FILTERS.map((f) => (
            <Chip key={f} label={f} icon={f === 'Favourites' ? 'star' : undefined} active={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={results}
        keyExtractor={(f) => f.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: added.length ? 110 : 40 }}
        ListHeaderComponent={
          !query && filter === 'All' ? (
            <View>
              {!pickMode ? (
                <Pressable onPress={() => router.replace('/snap')} style={styles.snapRow} accessibilityRole="button">
                  <View style={[styles.snapIcon]}>
                    <Icon name="camera-iris" size={22} color={C.citrusInk} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={T.h3}>Snap instead</Text>
                    <Text style={T.small}>Log a whole plate from one photo</Text>
                  </View>
                  <Icon name="chevron-right" size={22} color={C.ink3} />
                </Pressable>
              ) : null}
              {recents.length ? (
                <>
                  <Text style={[T.label, { marginTop: 14, marginBottom: 4 }]}>Recent</Text>
                  {recents.map((f) => (
                    <Row key={`r-${f.id}`} f={f} />
                  ))}
                  <Text style={[T.label, { marginTop: 18, marginBottom: 4 }]}>All foods</Text>
                </>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => <Row f={item} />}
        ListEmptyComponent={
          filter === 'Favourites' && !query ? (
            <Empty icon="star-outline" title="No favourites yet" body="Tap the star next to any food to find it here faster." />
          ) : (
            <Empty icon="magnify" title="Nothing found" body={query ? `No foods match “${query}”${filter !== 'All' ? ` in ${filter}` : ''}.` : 'Try another filter.'} />
          )
        }
        ListFooterComponent={customCard}
      />

      {added.length ? (
        <View style={styles.doneBar}>
          <Text style={[T.body, { flex: 1, fontFamily: F.semi }]} numberOfLines={1}>
            {added.length} added to {meal.toLowerCase()}
          </Text>
          <Button label="Done" small onPress={() => goBack()} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: R.md, paddingHorizontal: 14, minHeight: 50, borderWidth: 1, borderColor: C.line },
  searchInput: { flex: 1, fontFamily: F.medium, fontSize: 16, color: C.ink, paddingVertical: 10, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line2 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  customCard: { marginTop: 16, backgroundColor: C.card, borderRadius: R.lg, padding: 14, gap: 10, borderWidth: 1, borderColor: C.line },
  snapRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.citrusSoft, borderRadius: R.lg, padding: 12 },
  snapIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.citrus, alignItems: 'center', justifyContent: 'center' },
  doneBar: { position: 'absolute', left: 16, right: 16, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: R.lg, padding: 12, paddingLeft: 16, borderWidth: 1, borderColor: C.line },
});

