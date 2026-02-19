import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { auth, db, storage } from '../firebaseClient';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
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
