import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _db: Database | null = null;

function getApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return _app;
}

export function getDb(): Database {
  if (!_db) {
    _db = getDatabase(getApp());
  }
  return _db;
}

let _authReady: Promise<void> | null = null;

// Resolves once anonymous sign-in has completed. Database rules require
// auth != null, so every db operation awaits this first. If the Anonymous
// provider isn't enabled (yet), we swallow the error — open rules still work.
export function authReady(): Promise<void> {
  if (!_authReady) {
    _authReady = (async () => {
      try {
        const auth = getAuth(getApp());
        if (!auth.currentUser) await signInAnonymously(auth);
      } catch {}
    })();
  }
  return _authReady;
}
