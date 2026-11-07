"use client";

// Mounts once (in the root layout) and does two things:
//  1. Vercel Web Analytics — cookieless, page-level traffic, external dashboard.
//  2. Our own `page_view` events into RTDB, so the in-app admin breakdown is
//     self-contained and can slice by signed-in user.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { track, trackError } from "@/lib/analytics";

export default function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) track("page_view", { path: pathname });
  }, [pathname]);

  // Catch what the app doesn't: uncaught errors and unhandled promise rejections.
  // (The many deliberate `.catch(() => {})` sites stay silent; the important
  // write-failures call trackError directly.)
  useEffect(() => {
    const onError = (e: ErrorEvent) =>
      trackError("window.onerror", e.message || e.error);
    const onRejection = (e: PromiseRejectionEvent) =>
      trackError("unhandledrejection", e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return <VercelAnalytics />;
}
