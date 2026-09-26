import { Redirect, router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, Sheet, tap, useToast } from '@/components/ui';
import { dayKey } from '@/lib/dates';
import { useStore } from '@/lib/store';
import { mealForNow } from '@/lib/summary';
import { C, F, T } from '@/theme';

const TAB_META: Record<string, { label: string; icon: string; iconOn: string }> = {
  index: { label: 'Home', icon: 'home-outline', iconOn: 'home' },
  insights: { label: 'Progress', icon: 'chart-box-outline', iconOn: 'chart-box' },
  foods: { label: 'Foods', icon: 'food-apple-outline', iconOn: 'food-apple' },
  profile: { label: 'Me', icon: 'account-circle-outline', iconOn: 'account-circle' },
};

export default function TabLayout() {
  const { state } = useStore();
  if (!state.loggedIn) return <Redirect href="/welcome" />;
  if (!state.profile) return <Redirect href="/onboarding" />;
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="insights" />
      <Tabs.Screen name="foods" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const [open, setOpen] = useState(false);
  const routes = state.routes;
  const left = routes.slice(0, 2);
  const right = routes.slice(2);

  const renderTab = (route: (typeof routes)[number]) => {
    const i = routes.indexOf(route);
    const focused = state.index === i;
    const meta = TAB_META[route.name] ?? { label: route.name, icon: 'circle', iconOn: 'circle' };
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) {
            tap();
            navigation.navigate(route.name);
          }
        }}
        style={styles.tab}
      >
        <Icon name={focused ? meta.iconOn : meta.icon} size={25} color={focused ? C.brand : C.ink3} />
        <Text style={[styles.tabText, focused && { color: C.brand }]}>{meta.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {left.map(renderTab)}
      <View style={styles.tab}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log something"
          onPress={() => {
            tap();
            setOpen(true);
          }}
          style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <Icon name="plus" size={30} color="#fff" />
        </Pressable>
      </View>
      {right.map(renderTab)}
      <QuickAdd visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

function QuickAdd({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { addWater, state } = useStore();
  const toast = useToast();
  const go = (fn: () => void) => {
    onClose();
    setTimeout(fn, 180);
  };
  const glass = state.settings.glassMl;
  const items: { icon: string; label: string; sub: string; color: string; bg: string; run: () => void }[] = [
    { icon: 'camera-iris', label: 'Snap a meal', sub: 'Photo, then tap foods', color: C.citrusInk, bg: C.citrus, run: () => go(() => router.push('/snap')) },
    { icon: 'magnify', label: 'Log food', sub: `Add to ${mealForNow().toLowerCase()}`, color: C.brand, bg: C.brandSoft, run: () => go(() => router.push({ pathname: '/log', params: { meal: mealForNow(), day: dayKey() } })) },
    {
      icon: 'cup-water',
      label: 'Add a glass',
      sub: `${glass} ml of water`,
      color: C.water,
      bg: C.waterSoft,
      run: () => {
        addWater(dayKey(), glass);
        onClose();
        toast(`Added ${glass} ml of water.`, { label: 'Undo', run: () => addWater(dayKey(), -glass) });
      },
    },
    { icon: 'run', label: 'Workout', sub: 'Log exercise', color: C.workout, bg: C.workoutSoft, run: () => go(() => router.push('/workout')) },
    { icon: 'scale-bathroom', label: 'Weight', sub: 'Log today’s weight', color: C.weight, bg: C.weightSoft, run: () => go(() => router.push('/weight')) },
    { icon: 'barcode-scan', label: 'Scan barcode', sub: 'Packaged foods', color: C.coach, bg: C.coachSoft, run: () => go(() => router.push({ pathname: '/barcode', params: { meal: mealForNow(), day: dayKey() } })) },
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title="Track">
      <View style={styles.grid}>
        {items.map((it) => (
          <Pressable key={it.label} onPress={it.run} style={({ pressed }) => [styles.qa, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={it.label}>
            <View style={[styles.qaIcon, { backgroundColor: it.bg }]}>
              <Icon name={it.icon} size={26} color={it.color} />
            </View>
            <Text style={[T.h3, { fontSize: 14.5, textAlign: 'center' }]}>{it.label}</Text>
            <Text style={[T.tiny, { textAlign: 'center' }]}>{it.sub}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line2, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 2, minHeight: 48 },
  tabText: { fontFamily: F.semi, fontSize: 11.5, color: C.ink3 },
  fab: { width: 58, height: 58, borderRadius: 20, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginTop: -26, borderWidth: 4, borderColor: C.bg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginBottom: 8 },
  qa: { width: '31.5%', backgroundColor: C.card, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  qaIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
