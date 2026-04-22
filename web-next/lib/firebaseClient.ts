import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const pickEnv = (nextPublicKey: string, expoPublicKey: string) =>
  process.env[nextPublicKey] || process.env[expoPublicKey] || '';

const firebaseDefaults = {
  apiKey: 'AIzaSyAOacFgUL2w9WYNOnuLPC0w2qFebdy2d64',
  authDomain: 'profissions-2746d.firebaseapp.com',
  projectId: 'profissions-2746d',
  storageBucket: 'profissions-2746d.appspot.com',
  messagingSenderId: '733790875876',
  appId: '1:733790875876:web:57d4a8a1271e8bfec53cf1',
  databaseURL: 'https://profissions-2746d-default-rtdb.firebaseio.com',
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
  databaseURL:
    pickEnv('NEXT_PUBLIC_FIREBASE_DATABASE_URL', 'EXPO_PUBLIC_FIREBASE_DATABASE_URL') ||
    firebaseDefaults.databaseURL,
  measurementId:
    pickEnv('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID', 'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID') ||
    firebaseDefaults.measurementId,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const realtimeDb = getDatabase(app);
