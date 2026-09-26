// Google sign-in on the web: Firebase's popup flow.
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { AuthError, authError, toAccount } from './auth-errors';
import { getCloud } from './firebase';
import type { Account } from './store';

export function googleAvailability(): { ok: boolean; reason?: string } {
  return getCloud() ? { ok: true } : { ok: false, reason: 'Cloud accounts aren’t set up in this build yet.' };
}

export async function googleSignIn(): Promise<Account | null> {
  const cloud = getCloud();
  if (!cloud) throw new AuthError('unavailable', 'Cloud accounts aren’t set up in this build yet.');
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(cloud.auth, provider);
    return toAccount(cred.user, 'google');
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
    throw authError(e);
  }
}

export async function googleSignOut() {}
