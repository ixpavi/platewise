// Cloud sync with Firestore. Layout:
//   users/{uid}                 profile, settings, weights, favourites, recents, custom foods
//   users/{uid}/days/{yyyy-mm-dd}  one document per day: food, water, steps, sleep, workouts
// The phone keeps a full local copy (AsyncStorage), so the app works offline; changed days
// are uploaded a couple of seconds after each edit and on reconnect. Per-day "newest edit wins".
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getCloud } from './firebase';
import { useStore, type DayLog, type State, type SyncMeta } from './store';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'offline';
type Ctx = { status: SyncStatus; error: string | null; user: User | null; authChecked: boolean; pulledUid: string | null; syncNow(): Promise<void>; wipeCloud(): Promise<void> };
const SyncCtx = createContext<Ctx>({ status: 'off', error: null, user: null, authChecked: true, pulledUid: null, syncNow: async () => {}, wipeCloud: async () => {} });
export const useSync = () => useContext(SyncCtx);

const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// Web photos are data: URLs (~50 KB each); uploading them would push day documents past
// Firestore's 1 MB limit. Phone photos are file paths and stay useful on the same phone.
function dayForUpload(d: DayLog) {
  return { ...d, food: d.food.map((e) => (e.photo?.startsWith('data:') ? { ...e, photo: undefined } : e)) };
}

const num = (v: unknown, lo: number, hi: number, dflt = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
/** Cloud data comes from other devices/app versions: never trust its shape. */
function sanitizeDay(r: Partial<DayLog>): DayLog {
  const food = (Array.isArray(r.food) ? r.food : [])
    .filter((e) => e && typeof e.id === 'string' && typeof e.foodId === 'string')
    .map((e) => ({ ...e, qty: num(e.qty, 0, 1000, 1), grams: num(e.grams, 0, 5000), t: num(e.t, 0, 9e15, Date.now()) }));
  const workouts = (Array.isArray(r.workouts) ? r.workouts : []).filter((w) => w && typeof w.id === 'string').map((w) => ({ ...w, minutes: num(w.minutes, 0, 1440), kcal: num(w.kcal, 0, 5000) }));
  return { food, workouts, waterMl: num(r.waterMl, 0, 10000), steps: num(r.steps, 0, 100000), sleepHrs: r.sleepHrs == null ? null : num(r.sleepHrs, 0, 16) };
}

function rootDoc(s: State, rootU: number) {
  return clean({
    v: 1,
    rootU,
    account: s.account ? { name: s.account.name, email: s.account.email, photo: s.account.photo ?? null } : null,
    profile: s.profile,
    settings: s.settings,
    weights: s.weights,
    favs: s.favs,
    recents: s.recents,
    custom: s.custom,
  });
}

export function CloudSync({ children }: { children: React.ReactNode }) {
  const store = useStore();
  const { state, sync, hydrated, applyCloud, markSynced, logOut } = store;
  const cloud = getCloud();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SyncStatus>(cloud ? 'idle' : 'off');
  const [error, setError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(!cloud);
  const [pulledUid, setPulledUid] = useState<string | null>(null);
  const pulledFor = useRef<string | null>(null);
  const busy = useRef(false);
  const latest = useRef({ state, sync });
  useEffect(() => {
    latest.current = { state, sync };
  }, [state, sync]);

  // Firebase session → app session.
  useEffect(() => {
    if (!cloud) return;
    return onAuthStateChanged(cloud.auth, (u) => {
      setUser(u);
      setAuthChecked(true);
      if (!u) {
        pulledFor.current = null;
        setPulledUid(null);
      }
    });
  }, [cloud]);

  // If Firebase says nobody is signed in but the app thinks a cloud user is, the session
  // expired or was revoked: log out locally so the user signs in again.
  const cloudAcc = state.account?.provider !== 'local' && state.account?.uid;
  useEffect(() => {
    if (!cloud || !hydrated || !cloudAcc || !state.loggedIn) return;
    const t = setTimeout(() => {
      if (!cloud.auth.currentUser) logOut();
    }, 4000);
    return () => clearTimeout(t);
  }, [cloud, hydrated, cloudAcc, state.loggedIn, logOut, user]);

  const pull = useCallback(
    async (u: User) => {
      if (!cloud) return;
      const { state: s, sync: meta } = latest.current;
      const rootSnap = await getDoc(doc(cloud.db, 'users', u.uid));
      const daySnaps = await getDocs(collection(cloud.db, 'users', u.uid, 'days'));
      const remoteRoot = rootSnap.exists() ? (rootSnap.data() as ReturnType<typeof rootDoc>) : null;
      const days = { ...s.days };
      const dayU = { ...meta.dayU };
      const dirty = new Set(meta.dirtyDays);
      daySnaps.forEach((d) => {
        const r = d.data() as DayLog & { u?: number };
        const remoteU = r.u ?? 0;
        const localU = meta.dayU[d.id] ?? 0;
        if (!s.days[d.id] || remoteU >= localU) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d.id)) return;
          days[d.id] = sanitizeDay(r);
          dayU[d.id] = remoteU;
          dirty.delete(d.id);
        } else dirty.add(d.id);
      });
      // Days that exist only on this phone get uploaded.
      Object.keys(s.days).forEach((k) => {
        if (!daySnaps.docs.some((d) => d.id === k) && s.days[k].food.length + s.days[k].workouts.length + (s.days[k].waterMl ? 1 : 0) > 0) dirty.add(k);
      });
      let next: Partial<State> = { days };
      let rootDirty = meta.rootDirty;
      let rootU = meta.rootU;
      if (remoteRoot && (remoteRoot.rootU >= meta.rootU || !s.profile)) {
        next = {
          ...next,
          profile: remoteRoot.profile ?? s.profile,
          settings: { ...s.settings, ...(remoteRoot.settings ?? {}) },
          weights: remoteRoot.weights ?? s.weights,
          favs: remoteRoot.favs ?? s.favs,
          recents: remoteRoot.recents ?? s.recents,
          custom: { ...s.custom, ...(remoteRoot.custom ?? {}) },
          account: s.account ? { ...s.account, name: s.account.name || remoteRoot.account?.name || '' } : s.account,
        };
        rootU = remoteRoot.rootU;
        rootDirty = Object.keys(s.custom).some((k) => !remoteRoot.custom?.[k]);
      } else if (s.profile) {
        rootDirty = true;
        rootU = Math.max(rootU, Date.now());
      }
      const merged: SyncMeta = { ...meta, dayU, dirtyDays: [...dirty], rootDirty, rootU };
      applyCloud(next, merged);
    },
    [cloud, applyCloud],
  );

  const push = useCallback(
    async (u: User) => {
      if (!cloud) return;
      const { state: s, sync: meta } = latest.current;
      if (!meta.dirtyDays.length && !meta.rootDirty) return;
      const started = Date.now();
      const keys = meta.dirtyDays.filter((k) => s.days[k]);
      for (let i = 0; i < Math.max(keys.length, 1); i += 400) {
        const batch = writeBatch(cloud.db);
        if (i === 0 && meta.rootDirty) batch.set(doc(cloud.db, 'users', u.uid), rootDoc(s, meta.rootU || started));
        for (const k of keys.slice(i, i + 400)) batch.set(doc(cloud.db, 'users', u.uid, 'days', k), clean({ ...dayForUpload(s.days[k]), u: meta.dayU[k] ?? started }));
        await batch.commit();
      }
      markSynced(meta.dirtyDays, meta.rootDirty, started);
    },
    [cloud, markSynced],
  );

  const run = useCallback(async () => {
    const u = cloud?.auth.currentUser;
    if (!cloud || !u || busy.current) return;
    busy.current = true;
    setStatus('syncing');
    try {
      if (pulledFor.current !== u.uid) {
        await pull(u);
        pulledFor.current = u.uid;
        setPulledUid(u.uid);
        // Let the merged state land before uploading.
        await new Promise((r) => setTimeout(r, 300));
      }
      await push(u);
      setStatus('idle');
      setError(null);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      // Don't keep the user waiting on the first download if it fails; local data still works.
      if (pulledFor.current !== u.uid) setPulledUid(u.uid);
      if (code === 'unavailable' || /network|offline/i.test(String((e as Error)?.message))) setStatus('offline');
      else {
        setStatus('error');
        setError(code === 'permission-denied' ? 'Firestore rules are blocking sync. Publish the rules from the README.' : 'Sync failed. It will retry automatically.');
      }
    } finally {
      busy.current = false;
    }
  }, [cloud, pull, push]);

  // Pull once per sign-in, then upload changes a moment after they happen.
  useEffect(() => {
    if (!user || !hydrated) return;
    if (!state.account?.uid || state.account.uid !== user.uid) return;
    const t = setTimeout(run, pulledFor.current === user.uid ? 2000 : 0);
    return () => clearTimeout(t);
  }, [user, hydrated, sync.dirtyDays.length, sync.rootDirty, state.account?.uid, run]);

  // Retry when the app comes back to the foreground, and every minute while there are changes.
  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (st) => st === 'active' && run());
    const iv = setInterval(() => {
      const m = latest.current.sync;
      if (m.dirtyDays.length || m.rootDirty) run();
    }, 60000);
    return () => {
      sub.remove();
      clearInterval(iv);
    };
  }, [user, run]);

  const wipeCloud = useCallback(async () => {
    const u = cloud?.auth.currentUser;
    if (!cloud || !u) return;
    const daySnaps = await getDocs(collection(cloud.db, 'users', u.uid, 'days'));
    const ids = daySnaps.docs.map((d) => d.id);
    for (let i = 0; i < Math.max(ids.length, 1); i += 400) {
      const batch = writeBatch(cloud.db);
      ids.slice(i, i + 400).forEach((id) => batch.delete(doc(cloud.db, 'users', u.uid, 'days', id)));
      if (i === 0) batch.delete(doc(cloud.db, 'users', u.uid));
      await batch.commit();
    }
  }, [cloud]);

  return <SyncCtx.Provider value={{ status: user ? status : cloud ? 'idle' : 'off', error, user, authChecked, pulledUid, syncNow: run, wipeCloud }}>{children}</SyncCtx.Provider>;
}
