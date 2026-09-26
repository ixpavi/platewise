import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FOOD_BY_ID, type Food } from '@/data/foods';
import { addDays, dayKey } from './dates';
import type { Profile } from './nutrition';
import { DEFAULT_REMINDERS, type Reminders } from './reminders';

export const MEALS = ['Breakfast', 'Morning snack', 'Lunch', 'Evening snack', 'Dinner'] as const;
export type Meal = (typeof MEALS)[number];

export type Entry = {
  id: string;
  foodId: string;
  unitId: string;
  qty: number;
  grams: number;
  meal: Meal;
  t: number;
  source: 'search' | 'snap' | 'custom' | 'repeat';
  photo?: string;
};
export type Workout = { id: string; activityId: string; minutes: number; kcal: number; t: number };
export type DayLog = { food: Entry[]; waterMl: number; steps: number; sleepHrs: number | null; workouts: Workout[] };
export type Settings = { waterGoalMl: number | null; stepGoal: number; calorieOverride: number | null; glassMl: number; reminders: Reminders };

export type Account = {
  /** local = this phone only; password / google = Firebase account that syncs. */
  provider: 'local' | 'password' | 'google';
  uid?: string;
  name: string;
  email: string;
  pwHash?: string;
  /** Random per-account salt for phone-only passwords (older accounts have none). */
  pwSalt?: string;
  /** Failed phone-only log-in attempts and the time until which log-in is locked. */
  failed?: number;
  lockedUntil?: number;
  photo?: string | null;
};

export type State = {
  account: Account | null;
  loggedIn: boolean;
  profile: Profile | null;
  settings: Settings;
  days: Record<string, DayLog>;
  weights: { day: string; kg: number }[];
  custom: Record<string, Food>;
  favs: string[];
  recents: string[];
};

const EMPTY_DAY: DayLog = { food: [], waterMl: 0, steps: 0, sleepHrs: null, workouts: [] };
const INITIAL: State = {
  account: null,
  loggedIn: false,
  profile: null,
  settings: { waterGoalMl: null, stepGoal: 8000, calorieOverride: null, glassMl: 250, reminders: DEFAULT_REMINDERS },
  days: {},
  weights: [],
  custom: {},
  favs: [],
  recents: [],
};
const STORAGE_KEY = 'platewise:v1';
const SYNC_KEY = 'platewise:sync';

/** Cloud sync bookkeeping: what changed locally since the last upload, and when. */
export type SyncMeta = { dirtyDays: string[]; rootDirty: boolean; dayU: Record<string, number>; rootU: number; lastSynced: number | null };
const INITIAL_SYNC: SyncMeta = { dirtyDays: [], rootDirty: false, dayU: {}, rootU: 0, lastSynced: null };
export const ROOT_KEYS = ['profile', 'settings', 'weights', 'custom', 'favs', 'recents', 'account'] as const;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

type Actions = {
  signUp(name: string, email: string, pwHash: string, pwSalt: string): void;
  logIn(upgrade?: { pwHash: string; pwSalt: string }): void;
  loginFailed(): void;
  /**
   * Sign in with a cloud account. Same cloud user: keep local data. Linking a signed-in
   * phone-only account: keep and upload it. A different cloud user: start clean. Returns
   * 'blocked' instead of touching a phone-only account's data that isn't being linked.
   */
  cloudSignIn(acc: Account, opts?: { link?: boolean }): 'ok' | 'blocked';
  /** Mark everything for upload again (e.g. after a failed cloud delete). */
  markAllDirty(): void;
  logOut(): void;
  saveProfile(p: Profile): void;
  updateSettings(patch: Partial<Settings>): void;
  addEntries(day: string, entries: Omit<Entry, 'id'>[]): Entry[];
  updateEntry(day: string, id: string, patch: Partial<Entry>): void;
  removeEntry(day: string, id: string): Entry | undefined;
  restoreEntries(day: string, entries: Entry[]): void;
  addWater(day: string, deltaMl: number): void;
  setSteps(day: string, steps: number): void;
  setSleep(day: string, hrs: number | null): void;
  addWorkout(day: string, w: Omit<Workout, 'id'>): void;
  removeWorkout(day: string, id: string): Workout | undefined;
  logWeight(day: string, kg: number): void;
  removeWeight(day: string): void;
  saveCustomFood(f: Food): void;
  toggleFav(id: string): boolean;
  resetAll(): void;
  loadSample(): void;
  /** Used by the sync engine only. */
  applyCloud(next: Partial<State>, meta: SyncMeta): void;
  markSynced(days: string[], root: boolean, at: number): void;
};

type Ctx = { state: State; sync: SyncMeta; hydrated: boolean; food(id: string): Food | undefined; day(key: string): DayLog } & Actions;
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(INITIAL);
  const [sync, setSync] = useState<SyncMeta>(INITIAL_SYNC);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRef = useRef<State | null>(null);
  const fromCloud = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    (async () => {
      try {
        const [raw, rawSync] = await Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(SYNC_KEY)]);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<State>;
          // Accounts saved before cloud sync existed are phone-only accounts.
          const account: Account | null = saved.account ? { ...saved.account, provider: saved.account.provider ?? 'local' } : null;
          const next = { ...INITIAL, ...saved, account, settings: { ...INITIAL.settings, ...(saved.settings ?? {}) } };
          prevRef.current = next;
          setState(next);
        }
        if (rawSync) setSync({ ...INITIAL_SYNC, ...(JSON.parse(rawSync) as Partial<SyncMeta>) });
      } catch {
        // Corrupt or unreadable storage: start fresh rather than crash.
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
        // Browser storage is small (~5 MB). If web photo thumbnails fill it, keep the logs
        // and drop the stored photos rather than failing to save anything.
        const slim: State = {
          ...state,
          days: Object.fromEntries(
            Object.entries(state.days).map(([k, d]) => [k, { ...d, food: d.food.map((e) => (e.photo?.startsWith('data:') ? { ...e, photo: undefined } : e)) }]),
          ),
        };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(slim)).catch(() => {});
      });
    }, 250);
  }, [state, hydrated]);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(SYNC_KEY, JSON.stringify(sync)).catch(() => {});
  }, [sync, hydrated]);

  // Change tracking for sync: compare with the previous state by reference, so every action
  // (including undo and sample data) marks exactly the days it touched.
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!hydrated || !prev || prev === state) return;
    if (fromCloud.current) {
      fromCloud.current = false;
      return;
    }
    const changed = Object.keys(state.days).filter((k) => state.days[k] !== prev.days[k]);
    const rootChanged = ROOT_KEYS.some((k) => state[k] !== prev[k]);
    if (!changed.length && !rootChanged) return;
    const now = Date.now();
    setSync((m) => ({
      ...m,
      dirtyDays: Array.from(new Set([...m.dirtyDays, ...changed])),
      dayU: changed.length ? { ...m.dayU, ...Object.fromEntries(changed.map((k) => [k, now])) } : m.dayU,
      rootDirty: m.rootDirty || rootChanged,
      rootU: rootChanged ? now : m.rootU,
    }));
  }, [state, hydrated]);

  const patchDay = useCallback((day: string, fn: (d: DayLog) => DayLog) => {
    setState((s) => ({ ...s, days: { ...s.days, [day]: fn(s.days[day] ?? EMPTY_DAY) } }));
  }, []);

  const food = useCallback((id: string) => FOOD_BY_ID[id] ?? state.custom[id], [state.custom]);
  const day = useCallback((key: string) => state.days[key] ?? EMPTY_DAY, [state.days]);

  const actions = useMemo<Actions>(
    () => ({
      signUp(name, email, pwHash, pwSalt) {
        setState((s) => ({ ...INITIAL, settings: s.settings, account: { provider: 'local', name, email, pwHash, pwSalt }, loggedIn: true }));
      },
      cloudSignIn(acc, opts) {
        const cur = stateRef.current.account;
        const loggedIn = stateRef.current.loggedIn;
        const sameUser = !!cur?.uid && cur.uid === acc.uid;
        const linking = !!opts?.link && cur?.provider === 'local' && loggedIn;
        if (cur?.provider === 'local' && !linking) return 'blocked';
        if (sameUser || linking || !cur) {
          setState((s) => ({ ...s, account: { ...acc, name: acc.name || s.profile?.name || s.account?.name || '' }, loggedIn: true }));
        } else {
          // A different cloud user on this phone: start clean, their data comes from the cloud.
          fromCloud.current = true;
          setSync(INITIAL_SYNC);
          setState({ ...INITIAL, account: acc, loggedIn: true });
        }
        return 'ok';
      },
      markAllDirty() {
        const now = Date.now();
        setSync((m) => ({
          ...m,
          dirtyDays: Object.keys(stateRef.current.days),
          dayU: Object.fromEntries(Object.keys(stateRef.current.days).map((k) => [k, now])),
          rootDirty: true,
          rootU: now,
        }));
      },
      logIn(upgrade) {
        setState((s) => ({ ...s, loggedIn: true, account: s.account ? { ...s.account, ...(upgrade ?? {}), failed: 0, lockedUntil: 0 } : s.account }));
      },
      loginFailed() {
        setState((s) => {
          if (!s.account) return s;
          const failed = (s.account.failed ?? 0) + 1;
          // After 5 wrong passwords: lock for 30 s, doubling each time (max 1 hour).
          const lockedUntil = failed >= 5 ? Date.now() + Math.min(3600, 30 * 2 ** (failed - 5)) * 1000 : 0;
          return { ...s, account: { ...s.account, failed, lockedUntil } };
        });
      },
      logOut() {
        setState((s) => ({ ...s, loggedIn: false }));
      },
      saveProfile(p) {
        setState((s) => {
          const today = dayKey();
          const weights = s.weights.some((w) => w.day === today)
            ? s.weights.map((w) => (w.day === today ? { ...w, kg: p.weightKg } : w))
            : [...s.weights, { day: today, kg: p.weightKg }];
          return { ...s, profile: p, account: s.account ? { ...s.account, name: p.name } : { provider: 'local', name: p.name, email: '' }, weights };
        });
      },
      updateSettings(patch) {
        setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      },
      addEntries(dayK, entries) {
        const withIds = entries.map((e) => ({ ...e, id: uid() }));
        setState((s) => {
          const d = s.days[dayK] ?? EMPTY_DAY;
          const ids = withIds.map((e) => e.foodId);
          const recents = [...ids, ...s.recents.filter((r) => !ids.includes(r))].slice(0, 30);
          return { ...s, recents, days: { ...s.days, [dayK]: { ...d, food: [...d.food, ...withIds] } } };
        });
        return withIds;
      },
      updateEntry(dayK, id, patch) {
        patchDay(dayK, (d) => ({ ...d, food: d.food.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
      },
      removeEntry(dayK, id) {
        const removed = stateRef.current.days[dayK]?.food.find((e) => e.id === id);
        patchDay(dayK, (d) => ({ ...d, food: d.food.filter((e) => e.id !== id) }));
        return removed;
      },
      restoreEntries(dayK, entries) {
        patchDay(dayK, (d) => ({ ...d, food: [...d.food.filter((e) => !entries.some((x) => x.id === e.id)), ...entries] }));
      },
      addWater(dayK, deltaMl) {
        patchDay(dayK, (d) => ({ ...d, waterMl: Math.max(0, Math.min(10000, d.waterMl + deltaMl)) }));
      },
      setSteps(dayK, steps) {
        patchDay(dayK, (d) => ({ ...d, steps: Math.max(0, Math.min(100000, Math.round(steps))) }));
      },
      setSleep(dayK, hrs) {
        patchDay(dayK, (d) => ({ ...d, sleepHrs: hrs == null ? null : Math.max(0, Math.min(16, hrs)) }));
      },
      addWorkout(dayK, w) {
        patchDay(dayK, (d) => ({ ...d, workouts: [...d.workouts, { ...w, id: uid() }] }));
      },
      removeWorkout(dayK, id) {
        const removed = stateRef.current.days[dayK]?.workouts.find((w) => w.id === id);
        patchDay(dayK, (d) => ({ ...d, workouts: d.workouts.filter((w) => w.id !== id) }));
        return removed;
      },
      logWeight(dayK, kg) {
        setState((s) => {
          const weights = [...s.weights.filter((w) => w.day !== dayK), { day: dayK, kg }].sort((a, b) => a.day.localeCompare(b.day));
          const latest = weights[weights.length - 1];
          const profile = s.profile && latest.day === dayK ? { ...s.profile, weightKg: kg } : s.profile;
          return { ...s, weights, profile };
        });
      },
      removeWeight(dayK) {
        setState((s) => ({ ...s, weights: s.weights.filter((w) => w.day !== dayK) }));
      },
      saveCustomFood(f) {
        setState((s) => ({ ...s, custom: { ...s.custom, [f.id]: f } }));
      },
      toggleFav(id) {
        const on = !stateRef.current.favs.includes(id);
        setState((s) => ({ ...s, favs: on ? [id, ...s.favs.filter((x) => x !== id)] : s.favs.filter((x) => x !== id) }));
        return on;
      },
      resetAll() {
        fromCloud.current = true;
        setState(INITIAL);
        setSync(INITIAL_SYNC);
        AsyncStorage.multiRemove([STORAGE_KEY, SYNC_KEY]).catch(() => {});
      },
      applyCloud(next, meta) {
        fromCloud.current = true;
        setState((s) => ({ ...s, ...next }));
        setSync(meta);
      },
      markSynced(days, root, at) {
        setSync((m) => ({
          ...m,
          dirtyDays: m.dirtyDays.filter((k) => !days.includes(k) || (m.dayU[k] ?? 0) > at),
          rootDirty: root ? m.rootU > at : m.rootDirty,
          lastSynced: at,
        }));
      },
      loadSample() {
        setState((s) => ({ ...s, ...sampleData(s) }));
      },
    }),
    [patchDay],
  );

  const value = useMemo<Ctx>(() => ({ state, sync, hydrated, food, day, ...actions }), [state, sync, hydrated, food, day, actions]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

/* A realistic past week so charts and insights have something to show in a demo. */
function sampleData(s: State): Partial<State> {
  const today = dayKey();
  const plan: [Meal, string, string, number][][] = [
    [['Breakfast', 'idli', 'piece', 3], ['Breakfast', 'chai', 'cup', 1], ['Lunch', 'chapati', 'roti', 2], ['Lunch', 'chole', 'katori', 1], ['Evening snack', 'apple', 'medium', 1], ['Dinner', 'rice', 'katori', 1], ['Dinner', 'dal', 'katori', 1]],
    [['Breakfast', 'oats', 'bowl', 1], ['Lunch', 'chicken-biryani', 'plate', 1], ['Evening snack', 'chai', 'cup', 1], ['Evening snack', 'samosa', 'piece', 1], ['Dinner', 'chapati', 'roti', 3], ['Dinner', 'palak-paneer', 'katori', 1]],
    [['Breakfast', 'boiled-egg', 'egg', 2], ['Breakfast', 'brown-bread', 'slice', 2], ['Lunch', 'rice', 'katori', 1], ['Lunch', 'rajma', 'katori', 1], ['Dinner', 'spaghetti', 'plate', 1], ['Dinner', 'salad', 'bowl', 1]],
    [['Breakfast', 'poha', 'plate', 1], ['Morning snack', 'banana', 'medium', 1], ['Lunch', 'aloo-paratha', 'piece', 2], ['Lunch', 'curd', 'katori', 1], ['Evening snack', 'roasted-chana', 'handful', 1], ['Dinner', 'masala-dosa', 'piece', 1], ['Dinner', 'sambar', 'katori', 1]],
    [['Breakfast', 'upma', 'bowl', 1], ['Breakfast', 'filter-coffee', 'cup', 1], ['Lunch', 'rice', 'katori', 1], ['Lunch', 'fish-curry', 'katori', 1], ['Evening snack', 'gulab-jamun', 'piece', 2], ['Dinner', 'chapati', 'roti', 2], ['Dinner', 'mix-veg', 'katori', 1]],
    [['Breakfast', 'thepla', 'piece', 2], ['Breakfast', 'chai', 'cup', 1], ['Lunch', 'pizza', 'slice', 3], ['Evening snack', 'cola', 'can', 1], ['Dinner', 'khichdi', 'katori', 1], ['Dinner', 'raita', 'katori', 1]],
  ];
  const hours: Record<Meal, number> = { Breakfast: 8, 'Morning snack': 11, Lunch: 13, 'Evening snack': 17, Dinner: 20 };
  const days = { ...s.days };
  plan.forEach((items, i) => {
    const key = addDays(today, -(i + 1));
    const base = new Date();
    base.setDate(base.getDate() - (i + 1));
    const food: Entry[] = items.flatMap(([meal, foodId, unitId, qty]) => {
      const f = FOOD_BY_ID[foodId];
      const unit = f?.units.find((u) => u.id === unitId);
      if (!f || !unit) return [];
      const t = new Date(base);
      t.setHours(hours[meal], 0, 0, 0);
      return [{ id: uid(), foodId, unitId, qty, grams: unit.grams * qty, meal, t: t.getTime(), source: 'search' as const }];
    });
    days[key] = {
      food,
      waterMl: [2250, 1750, 2500, 2000, 1500, 2750][i],
      steps: [7420, 4310, 9880, 6120, 3050, 11240][i],
      sleepHrs: [7, 6, 7.5, 6.5, 8, 7][i],
      workouts: i % 2 === 0 ? [{ id: uid(), activityId: i === 2 ? 'yoga' : 'walk', minutes: 30, kcal: i === 2 ? 80 : 140, t: base.getTime() }] : [],
    };
  });
  const startKg = s.profile?.weightKg ?? 68;
  const weights = [0.9, 0.7, 0.8, 0.5, 0.4, 0.2, 0].map((d, i) => ({ day: addDays(today, i - 6), kg: Math.round((startKg + d) * 10) / 10 }));
  const merged = [...s.weights.filter((w) => !weights.some((x) => x.day === w.day)), ...weights].sort((a, b) => a.day.localeCompare(b.day));
  return { days, weights: merged, recents: Array.from(new Set(['chai', 'chapati', 'dal', 'rice', 'idli', ...s.recents])).slice(0, 30), favs: s.favs.length ? s.favs : ['chapati', 'dal', 'curd'] };
}
