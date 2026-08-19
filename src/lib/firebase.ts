import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getAuth, onAuthStateChanged, type Auth, type User } from "firebase/auth";

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
let _auth: Auth | null = null;

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

export function getAuthInstance(): Auth {
  if (!_auth) {
    _auth = getAuth(getApp());
  }
  return _auth;
}

let _authReady: Promise<void> | null = null;

// Resolves once the initial auth state is known (the first onAuthStateChanged
// fire). Real per-user sign-in replaced anonymous auth — we no longer sign
// anyone in here; the AuthGate drives sign-in and only lets data pages render
// once a real user exists. Every db operation still awaits this so that, by the
// time it runs, `auth.currentUser` (and its ID token) is populated. If the user
// isn't signed in the DB rules reject the call — which is the point.
export function authReady(): Promise<void> {
  if (!_authReady) {
    _authReady = new Promise<void>((resolve) => {
      try {
        const unsub = onAuthStateChanged(getAuthInstance(), () => {
          unsub();
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }
  return _authReady;
}

// The currently signed-in Firebase user (or null). Cheap synchronous read once
// authReady() has resolved.
export function currentUser(): User | null {
  try {
    return getAuthInstance().currentUser;
  } catch {
    return null;
  }
}
