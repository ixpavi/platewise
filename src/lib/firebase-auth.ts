// Android / iOS: keep the Firebase session in AsyncStorage so users stay signed in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuthRN from '@firebase/auth';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth, type Persistence } from 'firebase/auth';

// Metro loads the React Native build of @firebase/auth, which exports getReactNativePersistence.
// Its package lists the web typings first, so TypeScript can't see the export: reach it via a cast.
const getReactNativePersistence = (FirebaseAuthRN as unknown as { getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence })
  .getReactNativePersistence;

export function createAuth(app: FirebaseApp): Auth {
  try {
    if (!getReactNativePersistence) return getAuth(app);
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Already initialised (fast refresh).
    return getAuth(app);
  }
}
