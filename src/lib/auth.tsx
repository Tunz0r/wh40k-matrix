"use client";

// Real per-user authentication (Firebase Auth). Two providers, no passwords:
//   - Google Sign-In (primary): name + verified email come from the Google
//     profile.
//   - Email link (fallback): a passwordless "magic link" to the user's inbox.
//
// The user's email lives ONLY in Firebase Auth (Google-managed) — it is never
// written to the Realtime DB. Identity resolution (uid -> Player) happens in
// active-player.tsx; this provider only exposes the raw Firebase user + the
// sign-in/out actions.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  onAuthStateChanged,
  signOut,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  type User,
} from "firebase/auth";
import { getAuthInstance } from "./firebase";
import { upsertSelfUser } from "./membership";

const EMAIL_KEY = "wtc-email-for-signin";

// Test-login: a credential-free throwaway identity (Firebase anonymous) so
// multi-user flows (join / claim / field access) can be exercised without real
// teammates. OFF unless NEXT_PUBLIC_ENABLE_TEST_LOGIN==="1" — production leaves it
// unset, so anonymous is still rejected there. Requires the Anonymous provider
// enabled in the Firebase console.
export const TEST_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "1";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  signInAsTestUser: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

// The URL the email link returns to. Any same-origin route works — the
// completion logic in AuthProvider runs on mount regardless of route — so we
// return to the app root.
function emailLinkRedirect(): string {
  return `${window.location.origin}/`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuthInstance();

    // Complete an email-link sign-in if we arrived via one.
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = localStorage.getItem(EMAIL_KEY);
      if (!email) {
        // Opened on a different device/browser than the request — ask for it.
        email = window.prompt("Bekræft din e-mail for at logge ind") || "";
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            localStorage.removeItem(EMAIL_KEY);
            // Strip the one-time link params from the URL.
            window.history.replaceState({}, "", window.location.pathname);
          })
          .catch(() => {});
      }
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      // Reject leftover anonymous sessions from the old app version — they must
      // not reach the claim screen. Sign them out and show the real login.
      // EXCEPT when test-login is enabled (a deliberate test build), where an
      // anonymous user IS the throwaway test identity.
      if (u && u.isAnonymous && !TEST_LOGIN_ENABLED) {
        signOut(auth).catch(() => {});
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(u);
      setLoading(false);
      // Register/refresh this login in the admin-visible users list (name only,
      // never email). Best-effort — a denied write must not block sign-in.
      if (u) upsertSelfUser(u.uid, u.displayName).catch(() => {});
    });
    return unsub;
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      signInWithGoogle: async () => {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(getAuthInstance(), provider);
      },
      sendEmailLink: async (email: string) => {
        await sendSignInLinkToEmail(getAuthInstance(), email, {
          url: emailLinkRedirect(),
          handleCodeInApp: true,
        });
        localStorage.setItem(EMAIL_KEY, email);
      },
      signInAsTestUser: async () => {
        if (!TEST_LOGIN_ENABLED) return;
        await signInAnonymously(getAuthInstance());
      },
      signOutUser: async () => {
        await signOut(getAuthInstance());
      },
    }),
    [user, loading]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  return (
    useContext(Ctx) ?? {
      user: null,
      loading: true,
      signInWithGoogle: async () => {},
      sendEmailLink: async () => {},
      signInAsTestUser: async () => {},
      signOutUser: async () => {},
    }
  );
}
