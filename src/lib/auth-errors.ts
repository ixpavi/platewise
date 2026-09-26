// Shared by email and Google sign-in. Kept separate so cloud-auth and google don't import each other.
import type { User } from 'firebase/auth';
import type { Account } from './store';

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists. Log in instead.',
  'auth/invalid-email': 'That email looks incomplete, e.g. you@example.com.',
  'auth/weak-password': 'Use at least 6 characters.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with this email. Check the spelling or create one.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No internet connection. Check your connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method isn’t switched on in Firebase yet (Authentication → Sign-in method).',
  'auth/configuration-not-found': 'Cloud accounts aren’t set up yet. Use “this phone only” for now.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'This app’s Firebase key is wrong. Check the values in .env.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups for this site and try again.',
  'auth/account-exists-with-different-credential': 'This email is already registered with a different sign-in method. Use that method.',
  'auth/requires-recent-login': 'For your security, log out and log back in, then try again.',
  'auth/unauthorized-domain': 'This web address isn’t allowed in Firebase (Authentication → Settings → Authorized domains).',
};

export function authError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const code = (e as { code?: string })?.code ?? 'unknown';
  return new AuthError(code, MESSAGES[code] ?? 'Something went wrong signing in. Please try again.');
}

export function toAccount(u: User, provider: Account['provider']): Account {
  return { provider, uid: u.uid, name: u.displayName ?? '', email: u.email ?? '', photo: u.photoURL };
}
