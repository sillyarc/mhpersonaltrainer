import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { auth, db, storage } from '../firebaseClient';

const pickEnv = (nextPublicKey: string, expoPublicKey: string) =>
  process.env[nextPublicKey] || process.env[expoPublicKey] || '';

const firebaseDefaults = {
  apiKey: 'AIzaSyAOacFgUL2w9WYNOnuLPC0w2qFebdy2d64',
  authDomain: 'profissions-2746d.firebaseapp.com',
  projectId: 'profissions-2746d',
  storageBucket: 'profissions-2746d.appspot.com',
  messagingSenderId: '733790875876',
  appId: '1:733790875876:web:57d4a8a1271e8bfec53cf1',
  measurementId: 'G-TX29X2CZTT',
};

const firebaseConfig = {
  apiKey: pickEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'EXPO_PUBLIC_FIREBASE_API_KEY') || firebaseDefaults.apiKey,
  authDomain:
    pickEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') || firebaseDefaults.authDomain,
  projectId: pickEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID') || firebaseDefaults.projectId,
  storageBucket:
    pickEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') ||
    firebaseDefaults.storageBucket,
  messagingSenderId: pickEnv(
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'
  ) || firebaseDefaults.messagingSenderId,
  appId: pickEnv('NEXT_PUBLIC_FIREBASE_APP_ID', 'EXPO_PUBLIC_FIREBASE_APP_ID') || firebaseDefaults.appId,
  measurementId:
    pickEnv('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID', 'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID') ||
    firebaseDefaults.measurementId,
};

let app: FirebaseApp | null = null;
const SECONDARY_APP_NAME = 'academy-secondary';

export function initializeFirebase() {
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return { app, auth, db, storage };
}

export function getFirebaseAuth(): Auth {
  if (!app) initializeFirebase();
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!app) initializeFirebase();
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!app) initializeFirebase();
  return storage;
}

export { auth, db, storage };

export function getFirebaseApp(): FirebaseApp {
  if (!app) initializeFirebase();
  return app!;
}

export function getSecondaryAuth(): Auth {
  const secondaryApp = getApps().some((item) => item.name === SECONDARY_APP_NAME)
    ? getApp(SECONDARY_APP_NAME)
    : initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  return getAuth(secondaryApp);
}
