"use client";

// Global "apply disposition bias" switch. The disposition-matchup edge (the ±BP
// corner chips, and the amount folded into forecasts) is a minor signal next to
// the list matchup, so it's OFF by default and opt-in: a single persisted flag
// every page reads, flipped from the estimates-page / dashboard toggle. Shared
// key with the old estimates-local setting so an existing preference carries over.
import { useEffect, useState } from "react";

const KEY = "wtc-est-dispadj";
const EVT = "wtc-disp-bias-change";

export function getDispBias(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDispBias(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: on }));
  } catch {}
}

// Reactive read: false on first render (SSR-safe), then the stored value on mount,
// and live-updates when any page flips the switch (same-tab event + cross-tab
// `storage`).
export function useDispBias(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(getDispBias());
    const sync = () => setOn(getDispBias());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [on, (v: boolean) => { setDispBias(v); setOn(v); }];
}
