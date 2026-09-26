import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { Account } from './store';
import { getCloud } from './firebase';
import { AuthError, authError, toAccount } from './auth-errors';
import { googleSignOut } from './google';

export { AuthError, authError, toAccount };

function need() {
  const c = getCloud();
  if (!c) throw new AuthError('not-configured', 'Cloud accounts aren’t set up in this build yet.');
  return c;
}

export async function emailSignUp(name: string, email: string, password: string): Promise<Account> {
  try {
    const { auth } = need();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(cred.user, { displayName: name });
    return { ...toAccount(cred.user, 'password'), name };
  } catch (e) {
    throw authError(e);
  }
}

export async function emailSignIn(email: string, password: string): Promise<Account> {
  try {
    const { auth } = need();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return toAccount(cred.user, 'password');
  } catch (e) {
    throw authError(e);
  }
}

export async function resetPassword(email: string) {
  try {
    const { auth } = need();
    await sendPasswordResetEmail(auth, email);
  } catch (e) {
    throw authError(e);
  }
}

export async function cloudSignOut() {
  const c = getCloud();
  await googleSignOut().catch(() => {});
  if (c) await signOut(c.auth).catch(() => {});
}

export async function deleteCloudUser() {
  const c = getCloud();
  const u = c?.auth.currentUser;
  if (!u) return;
  try {
    await deleteUser(u);
  } catch (e) {
    throw authError(e);
  }
}
