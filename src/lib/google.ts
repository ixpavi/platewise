// Google sign-in on Android / iOS: the native Google account picker returns an ID token,
// which signs in to Firebase. Needs the installed app (APK); Expo Go doesn't include the module.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { AuthError, authError, toAccount } from './auth-errors';
import { getCloud, GOOGLE_WEB_CLIENT_ID } from './firebase';
import type { Account } from './store';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

function loadModule(): GoogleModule | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null; // Expo Go
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    return null;
  }
}

let configured = false;

export function googleAvailability(): { ok: boolean; reason?: string } {
  if (!getCloud()) return { ok: false, reason: 'Cloud accounts aren’t set up in this build yet.' };
  if (!GOOGLE_WEB_CLIENT_ID) return { ok: false, reason: 'Google sign-in needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.' };
  if (!loadModule()) return { ok: false, reason: 'Google sign-in works in the installed Platewise app, not in Expo Go.' };
  return { ok: true };
}

/** Returns null when the user closes the account picker. */
export async function googleSignIn(): Promise<Account | null> {
  const cloud = getCloud();
  const mod = loadModule();
  const avail = googleAvailability();
  if (!cloud || !mod || !avail.ok) throw new AuthError('unavailable', avail.reason ?? 'Google sign-in isn’t available.');
  const { GoogleSignin, statusCodes, isErrorWithCode } = mod;
  try {
    if (!configured) {
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
      configured = true;
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res.type === 'cancelled') return null;
    const idToken = res.data.idToken;
    if (!idToken) throw new AuthError('no-token', 'Google didn’t return a sign-in token. Check the web client ID in .env.');
    const cred = await signInWithCredential(cloud.auth, GoogleAuthProvider.credential(idToken));
    return toAccount(cred.user, 'google');
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (e.code === statusCodes.IN_PROGRESS) throw new AuthError(e.code, 'Google sign-in is already open.');
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new AuthError(e.code, 'Google Play services is missing or out of date on this phone.');
      if (e.code === '10' || /DEVELOPER_ERROR/.test(String(e.message)))
        throw new AuthError('developer-error', 'Google sign-in isn’t set up for this app build yet: add the app’s SHA-1 fingerprint in Firebase (see README).');
    }
    throw authError(e);
  }
}

export async function googleSignOut() {
  const mod = loadModule();
  if (mod && configured) await mod.GoogleSignin.signOut();
}
