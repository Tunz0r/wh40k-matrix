"use client";

// Mounts once (in the root layout) and does two things:
//  1. Vercel Web Analytics — cookieless, page-level traffic, external dashboard.
//  2. Our own `page_view` events into RTDB, so the in-app admin breakdown is
//     self-contained and can slice by signed-in user.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { track } from "@/lib/analytics";

export default function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) track("page_view", { path: pathname });
  }, [pathname]);
  return <VercelAnalytics />;
}
