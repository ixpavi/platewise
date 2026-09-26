import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Logo } from '@/components/Logo';
import { useStore } from '@/lib/store';
import { useSync } from '@/lib/sync';
import { C, T } from '@/theme';

export default function Index() {
  const { state } = useStore();
  const { user, pulledUid, authChecked } = useSync();
  const cloudAcc = state.account && state.account.provider !== 'local' ? state.account : null;
  // After a cloud sign-in, wait for the first download so returning users skip onboarding.
  const waiting = state.loggedIn && !!cloudAcc && (!authChecked || (!!user && pulledUid !== user.uid));
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setGaveUp(true), 12000);
    return () => clearTimeout(t);
  }, [waiting]);

  if (waiting && !gaveUp) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: C.bg }}>
        <Logo size={48} />
        <ActivityIndicator color={C.brand} />
        <Text style={T.small}>Getting your logs…</Text>
      </View>
    );
  }
  if (!state.loggedIn) return <Redirect href="/welcome" />;
  if (!state.profile) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
