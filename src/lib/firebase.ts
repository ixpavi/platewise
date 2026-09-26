// Firebase is optional. It switches on only when the EXPO_PUBLIC_FIREBASE_* values are set in
// .env (see .env.example). Without them the app runs in phone-only mode.
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeFirestore, type Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import { createAuth } from './firebase-auth';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export const cloudEnabled = Boolean(config.apiKey && config.projectId && config.appId && config.authDomain);

type Cloud = { app: FirebaseApp; auth: Auth; db: Firestore };
let cloud: Cloud | null = null;

export function getCloud(): Cloud | null {
  if (!cloudEnabled) return null;
  if (cloud) return cloud;
  const app = getApps().length ? getApp() : initializeApp(config as Record<string, string>);
  const auth = createAuth(app);
  // Long-polling detection keeps Firestore working on Android networks that break WebSockets.
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, ignoreUndefinedProperties: true });
  cloud = { app, auth, db };
  return cloud;
}
