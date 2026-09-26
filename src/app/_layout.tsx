import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/ui';
import { StoreProvider, useStore } from '@/lib/store';
import { restoreReminders } from '@/lib/reminders';
import { CloudSync } from '@/lib/sync';
import { C } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Gate() {
  const { hydrated, state } = useStore();
  // Reminders live in settings (and sync across phones): schedule them on this device too.
  const remindersKey = JSON.stringify(state.settings.reminders);
  useEffect(() => {
    if (hydrated && state.loggedIn) restoreReminders(JSON.parse(remindersKey)).catch(() => {});
  }, [hydrated, state.loggedIn, remindersKey]);
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  const ready = hydrated && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="snap" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <CloudSync>
          <ToastProvider>
            <Gate />
          </ToastProvider>
        </CloudSync>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
