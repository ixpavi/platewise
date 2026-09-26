import { router } from 'expo-router';

/** Back when there is history; otherwise (deep link, web refresh) go to Home. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}
