import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhotoViewer, Thumb } from '@/components/photos';
import { Button, Empty, Header } from '@/components/ui';
import { relativeDay } from '@/lib/dates';
import { goBack } from '@/lib/nav';
import { kcalStr, scale } from '@/lib/nutrition';
import { useStore, type Meal } from '@/lib/store';
import { C, T } from '@/theme';

type Shot = { uri: string; day: string; meal: Meal; kcal: number; foods: string[] };

export default function Photos() {
  const { state, food } = useStore();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<Shot | null>(null);
  const cols = 3;
  const size = Math.floor((Math.min(width, 560) - 36 - (cols - 1) * 8) / cols);

  // One tile per photo (a photo can cover several foods of the same meal).
  const days = useMemo(() => {
    const out: { day: string; shots: Shot[] }[] = [];
    Object.keys(state.days)
      .sort((a, b) => b.localeCompare(a))
      .forEach((day) => {
        const byUri = new Map<string, Shot>();
        for (const e of state.days[day].food) {
          if (!e.photo) continue;
          const f = food(e.foodId);
          const s = byUri.get(e.photo) ?? { uri: e.photo, day, meal: e.meal, kcal: 0, foods: [] };
          s.kcal += f ? scale(f, e.grams).kcal : 0;
          if (f) s.foods.push(f.name);
          byUri.set(e.photo, s);
        }
        if (byUri.size) out.push({ day, shots: [...byUri.values()] });
      });
    return out;
  }, [state.days, food]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
      <View style={{ paddingHorizontal: 18 }}>
        <Header title="Meal photos" subtitle={days.length ? `${days.reduce((n, d) => n + d.shots.length, 0)} photos` : undefined} onBack={goBack} />
      </View>
      <FlatList
        data={days}
        keyExtractor={(d) => d.day}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Empty icon="image-multiple-outline" title="No meal photos yet" body="Log a meal with the camera and its photo shows up here, day by day." />
            <Button label="Snap a meal" icon="camera" onPress={() => router.push('/snap')} style={{ alignSelf: 'center', marginTop: 4 }} small />
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ marginTop: 16 }}>
            <Text style={[T.h3, { marginBottom: 8 }]}>{relativeDay(item.day)}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {item.shots.map((s) => (
                <View key={s.uri} style={{ width: size, gap: 4 }}>
                  <Thumb uri={s.uri} size={size} onPress={() => setOpen(s)} />
                  <Text style={T.tiny} numberOfLines={1}>
                    {s.meal} · {kcalStr(s.kcal)} kcal
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      />
      <PhotoViewer uri={open?.uri ?? null} caption={open ? `${relativeDay(open.day)} · ${open.meal} · ${kcalStr(open.kcal)} kcal\n${open.foods.join(', ')}` : ''} onClose={() => setOpen(null)} />
    </SafeAreaView>
  );
}
