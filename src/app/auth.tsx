import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button, Field, Header, Icon, Notice, Screen, Sheet, useToast } from '@/components/ui';
import { emailSignIn, emailSignUp, resetPassword, AuthError } from '@/lib/cloud-auth';
import { cloudEnabled } from '@/lib/firebase';
import { googleAvailability, googleSignIn } from '@/lib/google';
import { useStore, type Account } from '@/lib/store';
import { C, F, R, T } from '@/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Phone-only passwords: salted, iterated SHA-256 so a copied storage file can't be cracked quickly.
const ITERATIONS = 2000;
async function hashPassword(email: string, pw: string, salt: string) {
  let h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${email.toLowerCase()}:${pw}`);
  for (let i = 0; i < ITERATIONS; i++) h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${h}`);
  return h;
}
// Accounts made before salts existed.
const legacyHash = (email: string, pw: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `platewise:${email.toLowerCase()}:${pw}`);
const newSalt = () => Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');

export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string; link?: string }>();
  const linking = params.link === '1'; // phone-only user backing up to the cloud
  const [mode, setMode] = useState<'signup' | 'login'>(params.mode === 'login' ? 'login' : 'signup');
  const [kind, setKind] = useState<'cloud' | 'local'>(cloudEnabled ? 'cloud' : 'local');
  const { state, signUp, logIn, loginFailed, cloudSignIn } = useStore();
  const toast = useToast();
  const [name, setName] = useState(linking ? state.profile?.name ?? '' : '');
  const [email, setEmail] = useState(mode === 'login' && state.account?.provider === 'local' ? '' : state.account?.email ?? '');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [forgot, setForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetState, setResetState] = useState<{ busy?: boolean; sent?: boolean; error?: string }>({});
  const [resetting, setResetting] = useState(false);
  const google = googleAvailability();

  // A phone-only account lives on this phone. Signing in to a cloud account here must not
  // pull that person's logs into someone else's cloud account.
  const localOwner = state.account?.provider === 'local' && !linking ? state.account : null;
  const blockedMsg = localOwner
    ? `This phone has a phone-only account (${localOwner.email}). Log in to it and use “Back up to a cloud account” in Me, or delete it from Me before using a different account.`
    : '';

  const finishCloud = (acc: Account) => {
    if (cloudSignIn(acc, { link: linking }) === 'blocked') {
      setErrors({ form: blockedMsg });
      return;
    }
    toast(linking ? 'Signed in. Your logs are being backed up.' : `Signed in as ${acc.email || acc.name}.`);
    // The index route waits for the first cloud download, then sends the user on.
    router.replace('/');
  };

  const onGoogle = async () => {
    if (!google.ok || busy) return;
    if (localOwner) return setErrors({ form: blockedMsg });
    setErrors({});
    setBusy('google');
    try {
      const acc = await googleSignIn();
      if (acc) finishCloud(acc);
    } catch (e) {
      setErrors({ form: e instanceof AuthError ? e.message : 'Google sign-in failed. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const em = email.trim();
    if (mode === 'signup' && !name.trim()) e.name = 'Add your name so we can greet you.';
    if (!em) e.email = 'Enter your email.';
    else if (!EMAIL.test(em)) e.email = 'That email looks incomplete, e.g. you@example.com.';
    if (pw.length < 6) e.pw = 'Use at least 6 characters.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submitCloud = async () => {
    if (localOwner) return setErrors({ form: blockedMsg });
    if (!validate()) return;
    setBusy('email');
    try {
      const em = email.trim();
      const acc = mode === 'signup' ? await emailSignUp(name.trim().replace(/\s+/g, ' '), em, pw) : await emailSignIn(em, pw);
      finishCloud(acc);
    } catch (e) {
      const err = e instanceof AuthError ? e : new AuthError('unknown', 'Something went wrong. Try again.');
      if (/email/.test(err.code)) setErrors({ email: err.message });
      else if (/password|credential/.test(err.code)) setErrors({ pw: err.message });
      else setErrors({ form: err.message });
    } finally {
      setBusy(null);
    }
  };

  const submitLocal = async () => {
    if (!validate()) return;
    setBusy('email');
    try {
      const em = email.trim();
      if (mode === 'signup') {
        if (!resetting && state.account) {
          setErrors({
            email:
              state.account.email.toLowerCase() === em.toLowerCase()
                ? 'An account with this email is already on this phone. Log in instead.'
                : `This phone already has an account (${state.account.email}). Log in, or use “Forgot password?” to start over.`,
          });
          return;
        }
        const salt = newSalt();
        signUp(name.trim().replace(/\s+/g, ' '), em, await hashPassword(em, pw, salt), salt);
        router.replace('/onboarding');
      } else {
        const acc = state.account;
        if (!acc || acc.provider !== 'local' || acc.email.toLowerCase() !== em.toLowerCase()) {
          setErrors({ email: 'No phone-only account with this email here. Check the spelling or create one.' });
          return;
        }
        if (acc.lockedUntil && acc.lockedUntil > Date.now()) {
          setErrors({ pw: `Too many wrong passwords. Try again in ${Math.ceil((acc.lockedUntil - Date.now()) / 1000)} seconds.` });
          return;
        }
        const ok = acc.pwSalt ? (await hashPassword(em, pw, acc.pwSalt)) === acc.pwHash : !acc.pwHash || (await legacyHash(em, pw)) === acc.pwHash;
        if (!ok) {
          loginFailed();
          const left = 4 - (acc.failed ?? 0);
          setErrors({ pw: left > 0 ? `Wrong password. ${left} ${left === 1 ? 'try' : 'tries'} left before a short lock.` : 'Wrong password. Log-in is locked for a short while.' });
          return;
        }
        // Upgrade older accounts to a salted hash on successful log-in.
        let upgrade: { pwHash: string; pwSalt: string } | undefined;
        if (!acc.pwSalt) {
          const salt = newSalt();
          upgrade = { pwHash: await hashPassword(em, pw, salt), pwSalt: salt };
        }
        logIn(upgrade);
        router.replace(state.profile ? '/(tabs)' : '/onboarding');
      }
    } finally {
      setBusy(null);
    }
  };

  const sendReset = async () => {
    const em = resetEmail.trim();
    if (!EMAIL.test(em)) return setResetState({ error: 'Enter the email you signed up with.' });
    setResetState({ busy: true });
    try {
      await resetPassword(em);
      setResetState({ sent: true });
    } catch (e) {
      // Firebase doesn't reveal whether an email is registered; treat "not found" as sent.
      if (e instanceof AuthError && e.code === 'auth/user-not-found') setResetState({ sent: true });
      else setResetState({ error: e instanceof AuthError ? e.message : 'Couldn’t send the email. Try again.' });
    }
  };

  const title = linking ? 'Back up your logs' : mode === 'signup' ? 'Create your account' : 'Welcome back';
  const subtitle = linking
    ? 'Sign in and everything on this phone is copied to your account, so it’s safe if you change phones.'
    : mode === 'signup'
      ? 'Takes a minute. Next we’ll set your goal and daily calorie budget.'
      : 'Log in to pick up where you left off.';

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="" onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} />
      <Text style={[T.h1, { fontSize: 32, marginTop: 6 }]}>{title}</Text>
      <Text style={[T.body, { color: C.ink2, marginTop: 8, marginBottom: 22 }]}>{subtitle}</Text>

      {/* Setup hints are for developers; a release build just hides Google until it's configured. */}
      {(kind === 'cloud' || !cloudEnabled) && (google.ok || __DEV__) ? (
        <View style={{ gap: 12 }}>
          <Pressable onPress={onGoogle} disabled={!google.ok || !!busy} style={({ pressed }) => [styles.google, (!google.ok || busy) && { opacity: 0.55 }, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel="Continue with Google">
            <GoogleG />
            <Text style={styles.googleText}>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</Text>
          </Pressable>
          {!google.ok ? <Text style={[T.tiny, { textAlign: 'center' }]}>{google.reason}</Text> : null}
          <View style={styles.divider}>
            <View style={styles.rule} />
            <Text style={T.tiny}>{cloudEnabled ? 'or with email' : 'or with email on this phone'}</Text>
            <View style={styles.rule} />
          </View>
        </View>
      ) : null}

      <View style={{ gap: 14, marginTop: 4 }}>
        {mode === 'signup' ? (
          <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Riya Sharma" maxLength={40} autoCapitalize="words" error={errors.name} returnKeyType="next" />
        ) : null}
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" error={errors.email} />
        <View>
          <Field
            label="Password"
            value={pw}
            onChangeText={setPw}
            secureTextEntry={!showPw}
            placeholder="At least 6 characters"
            autoCapitalize="none"
            error={errors.pw}
            onSubmitEditing={kind === 'cloud' ? submitCloud : submitLocal}
            returnKeyType="go"
          />
          <Pressable onPress={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 14, top: 40 }} hitSlop={8} accessibilityLabel={showPw ? 'Hide password' : 'Show password'}>
            <Text style={{ fontFamily: F.bold, color: C.brand, fontSize: 13.5 }}>{showPw ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>
        {errors.form ? <Notice tone="bad" icon="alert-circle-outline">{errors.form}</Notice> : null}
        <Button label={mode === 'signup' ? 'Continue' : 'Log in'} onPress={kind === 'cloud' ? submitCloud : submitLocal} loading={busy === 'email'} disabled={busy === 'google'} style={{ marginTop: 4 }} />
        {mode === 'login' ? (
          <Button
            label="Forgot password?"
            kind="text"
            onPress={() => {
              setResetEmail(email.trim());
              setResetState({});
              setForgot(true);
            }}
          />
        ) : null}
      </View>

      <View style={{ marginTop: 22, alignItems: 'center', gap: 14 }}>
        <Text style={T.small}>
          {mode === 'signup' ? 'Already have an account? ' : 'New to Platewise? '}
          <Text onPress={() => (setErrors({}), setMode(mode === 'signup' ? 'login' : 'signup'))} style={{ color: C.brand, fontFamily: F.bold }}>
            {mode === 'signup' ? 'Log in' : 'Create one'}
          </Text>
        </Text>
        {cloudEnabled && !linking ? (
          <Pressable onPress={() => (setErrors({}), setKind(kind === 'cloud' ? 'local' : 'cloud'))} style={styles.switchKind} accessibilityRole="button">
            <Icon name={kind === 'cloud' ? 'cellphone' : 'cloud-outline'} size={18} color={C.ink2} />
            <Text style={[T.small, { color: C.ink }]}>{kind === 'cloud' ? 'Use without an account (this phone only)' : 'Use a cloud account instead'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ marginTop: 24 }}>
        {kind === 'cloud' ? (
          <Notice icon="cloud-check-outline">Your logs sync to your account, so you can switch phones or use the web app. Meal photos stay on the phone that took them.</Notice>
        ) : (
          <Notice icon="shield-lock-outline">
            {cloudEnabled
              ? 'Phone-only accounts keep everything on this phone. You can back up to a cloud account later from Me.'
              : 'Your account and logs are stored on this phone. Google sign-in and cloud backup switch on once Firebase is set up (see README).'}
          </Notice>
        )}
      </View>

      <Sheet visible={forgot} onClose={() => setForgot(false)} title="Reset password">
        {kind === 'cloud' ? (
          resetState.sent ? (
            <>
              <Notice icon="email-check-outline">{`If ${resetEmail.trim()} has a Platewise account, a reset link is on its way. Check your inbox and spam folder.`}</Notice>
              <Button label="Back to log in" style={{ marginTop: 14 }} onPress={() => setForgot(false)} />
            </>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={[T.body, { color: C.ink2 }]}>We’ll email you a link to set a new password.</Text>
              <Field label="Email" value={resetEmail} onChangeText={setResetEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={resetState.error} />
              <Button label="Send reset link" onPress={sendReset} loading={resetState.busy} />
              <Button label="Cancel" kind="ghost" onPress={() => setForgot(false)} />
            </View>
          )
        ) : (
          <>
            <Text style={[T.body, { color: C.ink2, marginBottom: 16 }]}>
              Phone-only accounts can’t be reset by email. You can start over with a new account; this removes the logs saved on this phone.
            </Text>
            <Button
              label="Start a new account"
              kind="danger"
              onPress={() => {
                setForgot(false);
                setMode('signup');
                setResetting(true);
                setPw('');
                toast('Create a new account to continue.');
              }}
            />
            <Button label="Cancel" kind="ghost" style={{ marginTop: 10 }} onPress={() => setForgot(false)} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

/** Google's multicolour "G" mark, drawn per Google's sign-in branding guidelines. */
function GoogleG() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  google: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : {}),
  },
  googleText: { fontFamily: F.semi, fontSize: 16, color: '#1F1F1F' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  rule: { flex: 1, height: 1, backgroundColor: C.line },
  switchKind: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
});
