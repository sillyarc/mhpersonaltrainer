import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
// @ts-ignore - getReactNativePersistence exists in RN bundle but missing from TS definitions
import { initializeAuth, getReactNativePersistence, getAuth, Auth } from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

type FirebaseExtraConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  databaseURL?: string;
};

type ExpoExtra = {
  firebase?: FirebaseExtraConfig;
};

const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
const firebaseExtraConfig = expoExtra.firebase ?? {};
const pickFirebaseConfigValue = (envValue: string | undefined, extraValue?: string) =>
  (envValue ?? '').trim() || (extraValue ?? '').trim();

const firebaseConfig = {
  apiKey: pickFirebaseConfigValue(process.env.EXPO_PUBLIC_FIREBASE_API_KEY, firebaseExtraConfig.apiKey),
  authDomain: pickFirebaseConfigValue(
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    firebaseExtraConfig.authDomain
  ),
  projectId: pickFirebaseConfigValue(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, firebaseExtraConfig.projectId),
  storageBucket: pickFirebaseConfigValue(
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    firebaseExtraConfig.storageBucket
  ),
  messagingSenderId: pickFirebaseConfigValue(
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    firebaseExtraConfig.messagingSenderId
  ),
  appId: pickFirebaseConfigValue(process.env.EXPO_PUBLIC_FIREBASE_APP_ID, firebaseExtraConfig.appId),
  databaseURL:
    pickFirebaseConfigValue(
      process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
      firebaseExtraConfig.databaseURL
    ) || 'https://profissions-2746d-default-rtdb.firebaseio.com',
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let realtimeDb: Database;
let initialized = false;

function assertFirebaseConfig() {
  const requiredKeys: Array<keyof typeof firebaseConfig> = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
    'databaseURL',
  ];
  const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key]);

  if (missingKeys.length > 0) {
    throw new Error(
      `Firebase config missing: ${missingKeys.join(', ')}. Define EXPO_PUBLIC_FIREBASE_* in mh-personal-trainer-react-native/.env or expo.extra.firebase in app.json.`
    );
  }
}

export function initializeFirebase() {
  if (initialized && app && auth && db && storage && realtimeDb) {
    return { app, auth, db, storage, realtimeDb };
  }

  assertFirebaseConfig();

  const isNewApp = getApps().length === 0;

  if (isNewApp) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }

  if (!auth) {
    if (Platform.OS === 'web') {
      auth = getAuth(app);
    } else {
      try {
        if (isNewApp) {
          auth = initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage),
          });
        } else {
          auth = getAuth(app);
        }
      } catch (error) {
        const authErrorCode = (error as { code?: string } | null)?.code;
        if (authErrorCode === 'auth/already-initialized') {
          auth = getAuth(app);
        } else {
          throw error;
        }
      }
    }
  }

  if (!db) {
    db = getFirestore(app);
  }

  if (!storage) {
    storage = getStorage(app);
  }

  if (!realtimeDb) {
    realtimeDb = getDatabase(app);
  }

  initialized = true;

  return { app, auth, db, storage, realtimeDb };
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    initializeFirebase();
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    initializeFirebase();
  }
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) {
    initializeFirebase();
  }
  return storage;
}

export function getFirebaseDatabase(): Database {
  if (!realtimeDb) {
    initializeFirebase();
  }
  return realtimeDb;
}

export { auth, db, storage };

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    initializeFirebase();
  }
  return app;
}
