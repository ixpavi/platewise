import type { ConfigContext, ExpoConfig } from 'expo/config';

// Extends app.json. Google Sign-In's iOS URL scheme is only added once it's configured,
// so builds keep working before Firebase/Google keys exist. Android needs no plugin:
// the native module reads EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID at runtime.
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  const plugins = [...(config.plugins ?? [])];
  if (iosUrlScheme) plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  return { ...config, name: config.name ?? 'Platewise', slug: config.slug ?? 'platewise', plugins };
};
