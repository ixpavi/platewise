import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Icon, Notice, Pill, Screen, Section, Sheet, useToast } from '@/components/ui';
import { AuthError, cloudSignOut, deleteCloudUser } from '@/lib/cloud-auth';
import { cloudEnabled } from '@/lib/firebase';
import { ACTIVITY_HINT, bmi, bmiBand, fmtKg, kcalStr } from '@/lib/nutrition';
import { applyReminders, DEFAULT_REMINDERS } from '@/lib/reminders';
import { useStore } from '@/lib/store';
import { useSync } from '@/lib/sync';
import { useTargets } from '@/lib/summary';
import { C, F, R, T } from '@/theme';

export default function Me() {
  const { state, sync, logOut, resetAll, markAllDirty } = useStore();
  const cloud = useSync();
  const toast = useToast();
  const t = useTargets();
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const acc = state.account;
  const isCloud = !!acc && acc.provider !== 'local';
  const pending = sync.dirtyDays.length + (sync.rootDirty ? 1 : 0);
  const photoCount = new Set(Object.values(state.days).flatMap((d) => d.food.map((e) => e.photo).filter(Boolean))).size;

  const doLogout = async () => {
    setBusy(true);
    try {
      if (isCloud) {
        await cloud.syncNow().catch(() => {});
        await cloudSignOut();
        await applyReminders(DEFAULT_REMINDERS).catch(() => {});
        // The logs live in the cloud now; clear this phone so the next person can't see them.
        resetAll();
      } else logOut();
      setConfirm(null);
      router.replace({ pathname: '/auth', params: { mode: 'login' } });
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setDeleteError(null);
    try {
      if (isCloud) {
        await cloud.wipeCloud();
        try {
          await deleteCloudUser();
        } catch (e) {
          // Account couldn't be deleted (e.g. needs a recent log-in): put the logs back.
          markAllDirty();
          throw e;
        }
        await cloudSignOut();
      }
      await applyReminders(DEFAULT_REMINDERS).catch(() => {});
      resetAll();
      setConfirm(null);
      router.replace('/welcome');
      toast('Your data has been deleted.');
    } catch (e) {
      setDeleteError(e instanceof AuthError ? e.message : 'Couldn’t delete your cloud data. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const p = state.profile!;
  const [confirm, setConfirm] = useState<'logout' | 'delete' | null>(null);
  const b = bmi(p);
  const band = bmiBand(b);
  const toneColor = { good: C.good, warn: C.warn, bad: C.bad }[band.tone];
  const goalText =
    p.goal === 'lose'
      ? `Weight loss · ${fmtKg(p.weightKg - p.targetKg)} kg at ${p.pace} kg/week`
      : p.goal === 'gain'
        ? `Weight gain · ${fmtKg(p.targetKg - p.weightKg)} kg at ${p.pace} kg/week`
        : p.goal === 'fitness'
          ? 'Fitness · steady weight, more protein'
          : 'Healthy eating · steady weight';
  const loggedDays = Object.values(state.days).filter((d) => d.food.length).length;
  const entries = Object.values(state.days).reduce((s, d) => s + d.food.length, 0);

  return (
    <Screen bottomInset={40}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text style={{ fontFamily: F.displayHeavy, fontSize: 28, color: C.brand }}>{(p.name || 'U').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={T.h1} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={T.small} numberOfLines={1}>
            {state.account?.email}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat value={String(loggedDays)} label="Days logged" />
        <Stat value={String(entries)} label="Foods logged" />
        <Stat value={fmtKg(p.weightKg)} label="kg now" />
      </View>

      <AccountCard pending={pending} lastSynced={sync.lastSynced} />

      <Section title="Your details" action="Edit" onAction={() => router.push({ pathname: '/onboarding', params: { edit: '1' } })}>
        <Card style={{ gap: 14 }}>
          <Row icon="account-outline" label="Name" value={p.name} />
          <Row icon="human-male-height" label="Height" value={`${p.heightCm} cm`} />
          <Row icon="gender-male-female" label="Gender" value={p.gender} />
          <Row icon="cake-variant-outline" label="Age" value={`${p.age} years`} />
          <Row icon="flag-outline" label="Goal" value={goalText} />
        </Card>
      </Section>

      <Section title="Your plan" action="Edit" onAction={() => router.push({ pathname: '/onboarding', params: { edit: '1' } })}>
        <Card style={{ gap: 14 }}>
          <Row icon="fire" label="Daily budget" value={`${kcalStr(t.kcal)} kcal${state.settings.calorieOverride ? ' (custom)' : ''}`} />
          <Row icon="chart-donut" label="Macros" value={`C ${t.carb} g · P ${t.protein} g · F ${t.fat} g`} />
          <Row icon="walk" label="Activity" value={`${p.activity} · ${ACTIVITY_HINT[p.activity].toLowerCase()}`} />
          <Row icon={p.diet === 'veg' ? 'leaf' : p.diet === 'egg' ? 'egg-outline' : 'food-drumstick-outline'} label="Diet" value={p.diet === 'veg' ? 'Vegetarian' : p.diet === 'egg' ? 'Eggetarian' : 'Non-vegetarian'} />
          <View style={styles.bmi}>
            <View style={{ flex: 1 }}>
              <Text style={T.small}>BMI</Text>
              <Text style={[T.num, { fontSize: 24 }]}>{b.toFixed(1)}</Text>
            </View>
            <Pill label={band.label} color={toneColor} bg={`${toneColor}1F`} />
          </View>
          <Text style={T.tiny}>BMI uses Asian cut-offs (healthy 18.5–22.9). It doesn’t account for muscle, so treat it as a rough guide.</Text>
        </Card>
      </Section>

      <Section title="Settings">
        <Card style={{ padding: 0 }}>
          <Link icon="tune-variant" label="Meals, budget and reminders" sub="Your meals, calorie budget and meal reminders" onPress={() => router.push('/settings')} />
          <Link icon="image-multiple-outline" label="Meal photos" sub={photoCount ? `${photoCount} photo${photoCount === 1 ? '' : 's'}` : 'Photos from your photo logs'} onPress={() => router.push('/photos')} />
          <Link icon="scale-bathroom" label="Weight log" sub={`${state.weights.length} entries`} onPress={() => router.push('/weight')} />
          <Link icon="star-outline" label="Favourite foods" sub={`${state.favs.length} saved`} onPress={() => router.push({ pathname: '/log', params: {} })} last />
        </Card>
      </Section>

      <View style={{ gap: 10, marginTop: 22 }}>
        <Button label="Log out" icon="logout" kind="ghost" onPress={() => setConfirm('logout')} />
        <Button label="Delete my data" kind="text" style={{ minHeight: 40 }} onPress={() => setConfirm('delete')} />
      </View>
      <Text style={[T.tiny, { textAlign: 'center', marginTop: 12 }]}>Platewise 1.0 · Nutrition values are estimates, not medical advice.</Text>

      <Sheet visible={confirm === 'logout'} onClose={() => setConfirm(null)} title="Log out?">
        <Text style={[T.body, { color: C.ink2, marginBottom: 16 }]}>
          {isCloud
            ? 'Your logs are saved to your account, and this phone is cleared. Sign in again to get everything back. Meal photos stay on this phone.'
            : 'Your logs stay on this phone. You’ll need your email and password to log back in.'}
        </Text>
        {isCloud && pending ? (
          <View style={{ marginBottom: 12 }}>
            <Notice tone="warn" icon="cloud-alert-outline">{`${pending} change${pending === 1 ? '' : 's'} haven’t synced yet. We’ll try once more; if you’re offline they’ll be lost when you log out.`}</Notice>
          </View>
        ) : null}
        <Button label="Log out" kind="danger" loading={busy} onPress={doLogout} />
        <Button label="Cancel" kind="ghost" style={{ marginTop: 10 }} onPress={() => setConfirm(null)} />
      </Sheet>
      <Sheet visible={confirm === 'delete'} onClose={() => setConfirm(null)} title="Delete everything?">
        <Text style={[T.body, { color: C.ink2, marginBottom: 16 }]}>
          {isCloud
            ? 'This deletes your Platewise account and all logs in the cloud and on this phone. It can’t be undone.'
            : 'This removes your account, profile, food logs and weights from this phone. It can’t be undone.'}
        </Text>
        {deleteError ? (
          <View style={{ marginBottom: 12 }}>
            <Notice tone="bad" icon="alert-circle-outline">{deleteError}</Notice>
          </View>
        ) : null}
        <Button label="Delete everything" kind="danger" loading={busy} onPress={doDelete} />
        <Button label="Cancel" kind="ghost" style={{ marginTop: 10 }} onPress={() => setConfirm(null)} />
      </Sheet>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={{ flex: 1, padding: 12 }}>
      <Text style={[T.num, { fontSize: 22 }]}>{value}</Text>
      <Text style={T.tiny}>{label}</Text>
    </Card>
  );
}
function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <Icon name={icon} size={20} color={C.ink3} />
      <Text style={[T.small, { width: 84 }]}>{label}</Text>
      <Text style={[T.body, { flex: 1, fontFamily: F.semi }]}>{value}</Text>
    </View>
  );
}
function Link({ icon, label, sub, onPress, last }: { icon: string; label: string; sub: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.link, !last && styles.linkLine, pressed && { backgroundColor: C.line2 }]} accessibilityRole="button">
      <View style={styles.linkIcon}>
        <Icon name={icon} size={20} color={C.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={T.h3}>{label}</Text>
        <Text style={T.small}>{sub}</Text>
      </View>
      <Icon name="chevron-right" size={22} color={C.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 18, paddingBottom: 18 },
  avatar: { width: 68, height: 68, borderRadius: 24, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  bmi: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.line2, borderRadius: R.md, padding: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  linkLine: { borderBottomWidth: 1, borderBottomColor: C.line2 },
  linkIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
});

function AccountCard({ pending, lastSynced }: { pending: number; lastSynced: number | null }) {
  const { state } = useStore();
  const { status, error, syncNow } = useSync();
  const acc = state.account;
  if (!acc) return null;
  const isCloud = acc.provider !== 'local';
  const provider = acc.provider === 'google' ? 'Google account' : acc.provider === 'password' ? 'Email account' : 'This phone only';
  const statusText = !isCloud
    ? 'Logs are saved on this phone only.'
    : status === 'syncing'
      ? 'Syncing…'
      : status === 'offline'
        ? `Offline. ${pending ? `${pending} change${pending === 1 ? '' : 's'} will sync when you’re back online.` : 'Everything is saved on this phone.'}`
        : status === 'error'
          ? error ?? 'Sync failed. It will retry.'
          : pending
            ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync.`
            : lastSynced
              ? `All changes synced · ${new Date(lastSynced).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
              : 'Synced.';
  const icon = !isCloud ? 'cellphone' : status === 'error' ? 'cloud-alert-outline' : status === 'offline' ? 'cloud-off-outline' : status === 'syncing' ? 'cloud-sync-outline' : 'cloud-check-outline';
  const tone = !isCloud ? C.ink2 : status === 'error' ? C.bad : status === 'offline' ? C.warn : C.good;
  return (
    <Section title="Account">
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[styles.linkIcon, { backgroundColor: isCloud ? C.brandSoft : C.line2 }]}>
            <Icon name={acc.provider === 'google' ? 'google' : acc.provider === 'password' ? 'email-outline' : 'cellphone'} size={20} color={isCloud ? C.brand : C.ink2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={T.h3}>{provider}</Text>
            <Text style={T.small} numberOfLines={1}>
              {acc.email || acc.name}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={icon} size={18} color={tone} />
          <Text style={[T.small, { flex: 1, color: tone === C.good ? C.ink2 : tone }]}>{statusText}</Text>
          {isCloud && status !== 'syncing' ? (
            <Text onPress={() => syncNow()} style={{ color: C.brand, fontFamily: F.bold, fontSize: 13.5 }}>
              Sync now
            </Text>
          ) : null}
        </View>
        {!isCloud ? (
          cloudEnabled ? (
            <Button label="Back up to a cloud account" icon="cloud-upload-outline" kind="soft" small onPress={() => router.push({ pathname: '/auth', params: { mode: 'signup', link: '1' } })} />
          ) : (
            <Text style={T.tiny}>Cloud backup and Google sign-in switch on once Firebase is set up for this app.</Text>
          )
        ) : null}
      </Card>
    </Section>
  );
}
