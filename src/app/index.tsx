import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Logo } from '@/components/Logo';
import { LightStatusBar } from '@/components/ui';
import { useStore } from '@/lib/store';
import { useSync } from '@/lib/sync';
import { F } from '@/theme';

// The splash screen shows once per app start, then goes to Home if you're logged in, or Login.
let splashShown = false;
const SPLASH_MS = 1800;

export default function Index() {
  const { state } = useStore();
  const { user, pulledUid, authChecked } = useSync();
  const cloudAcc = state.account && state.account.provider !== 'local' ? state.account : null;
  // After a cloud sign-in, wait for the first download so returning users skip onboarding.
  const waiting = state.loggedIn && !!cloudAcc && (!authChecked || (!!user && pulledUid !== user.uid));
  const [gaveUp, setGaveUp] = useState(false);
  const [splash, setSplash] = useState(!splashShown);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setGaveUp(true), 12000);
    return () => clearTimeout(t);
  }, [waiting]);
  useEffect(() => {
    if (!splash) return;
    const t = setTimeout(() => {
      splashShown = true;
      setSplash(false);
    }, SPLASH_MS);
    return () => clearTimeout(t);
  }, [splash]);

  if (splash || (waiting && !gaveUp)) {
    return (
      <View style={styles.splash}>
        <LightStatusBar />
        <Logo size={96} ring="#fff" />
        <Text style={styles.name}>platewise</Text>
        <Text style={styles.tagline}>Know what you eat</Text>
        <View style={{ height: 40, justifyContent: 'center' }}>{waiting && !splash ? <ActivityIndicator color="#fff" /> : null}</View>
        {waiting && !splash ? <Text style={styles.note}>Getting your logs…</Text> : null}
      </View>
    );
  }
  if (!state.loggedIn) return <Redirect href="/welcome" />;
  if (!state.profile) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1F4D36' },
  name: { fontFamily: F.displayHeavy, fontSize: 38, color: '#fff', letterSpacing: -1, marginTop: 10 },
  tagline: { fontFamily: F.medium, fontSize: 17, color: 'rgba(255,255,255,0.8)' },
  note: { fontFamily: F.medium, fontSize: 13, color: 'rgba(255,255,255,0.7)' },
});
