"use client";

// Admin-only usage breakdown, powered by the `events` log (see src/lib/analytics.ts).
// Answers "which parts of the app actually get used" — feature events + page
// views, who's active, and the trend over the last two weeks. No PII: everything
// is keyed by uid, never names/emails.
import { useEffect, useMemo, useState } from "react";
import { subscribeToUsage, type UsageEvent } from "@/lib/analytics";

const DAY = 86_400_000;

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="w-44 shrink-0 truncate text-[#e8e8f0]" title={label}>{label}</div>
      <div className="flex-1 h-3.5 rounded bg-white/[0.04] overflow-hidden">
        <div className="h-full rounded" style={{ width: `${max ? (100 * value) / max : 0}%`, background: "#a855f7", opacity: 0.85 }} />
      </div>
      <div className="w-12 shrink-0 text-right tabular-nums text-[#e8e8f0] font-semibold">{value}</div>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  page_view: "Sidevisning",
  estimate_set: "Estimat sat",
  bulk_import: "Bulk-import (event)",
  list_paste: "Liste indsat",
  team_pinned: "Hold pinnet",
  pairing_committed: "Pairing valgt",
  warmup_logged: "Warmup logget",
  roster_imported: "Roster importeret",
  stats_viewed: "Stats åbnet",
  tournament_created: "Turnering oprettet",
  team_joined: "Hold tilmeldt",
  error: "Fejl",
};

// The first path segment of a /route, grouped for the page-view breakdown.
function routeOf(path: string): string {
  const seg = (path || "/").split("/").filter(Boolean)[0];
  return seg ? `/${seg}` : "/ (forside)";
}

export default function UsageAnalytics() {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => subscribeToUsage((e) => { setEvents(e); setLoaded(true); }), []);

  const stats = useMemo(() => {
    const now = Date.now();
    const since7 = now - 7 * DAY;
    const since1 = now - DAY;
    const recent7 = events.filter((e) => (e.ts || 0) >= since7);

    const byEvent = new Map<string, number>();
    const byRoute = new Map<string, number>();
    const byDay = new Map<string, number>();
    const users = new Set<string>();
    const users7 = new Set<string>();
    const users1 = new Set<string>();

    for (const e of events) {
      byEvent.set(e.e, (byEvent.get(e.e) || 0) + 1);
      if (e.e === "page_view") {
        const r = routeOf(String(e.path ?? ""));
        byRoute.set(r, (byRoute.get(r) || 0) + 1);
      }
      if (e.uid) {
        users.add(e.uid);
        if ((e.ts || 0) >= since7) users7.add(e.uid);
        if ((e.ts || 0) >= since1) users1.add(e.uid);
      }
    }
    // Last 14 days trend
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      byDay.set(`${d.getMonth() + 1}/${d.getDate()}`, 0);
    }
    for (const e of events) {
      if ((e.ts || 0) < now - 14 * DAY) continue;
      const d = new Date(e.ts || 0);
      const k = `${d.getMonth() + 1}/${d.getDate()}`;
      if (byDay.has(k)) byDay.set(k, (byDay.get(k) || 0) + 1);
    }

    const sortDesc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    const errors = events.filter((e) => e.e === "error");
    const errors7 = errors.filter((e) => (e.ts || 0) >= since7).length;
    const recentErrors = errors.slice(-8).reverse().map((e) => ({
      ctx: String(e.ctx ?? "?"),
      msg: String(e.msg ?? ""),
      ts: e.ts || 0,
    }));
    return {
      total: events.length,
      recent7: recent7.length,
      users: users.size,
      users7: users7.size,
      users1: users1.size,
      byEvent: sortDesc(byEvent),
      byRoute: sortDesc(byRoute),
      byDay: [...byDay.entries()],
      errors7,
      recentErrors,
      firstTs: events[0]?.ts ?? null,
    };
  }, [events]);

  const tiles = [
    { k: "Events i alt", v: stats.total, warn: false },
    { k: "Sidste 7 dage", v: stats.recent7, warn: false },
    { k: "Aktive brugere (7d)", v: stats.users7, warn: false },
    { k: "Aktive i dag", v: stats.users1, warn: false },
    { k: "Fejl (7d)", v: stats.errors7, warn: stats.errors7 > 0 },
  ];

  const maxEvent = stats.byEvent[0]?.[1] || 1;
  const maxRoute = stats.byRoute[0]?.[1] || 1;
  const maxDay = Math.max(1, ...stats.byDay.map(([, n]) => n));

  return (
    <section className="rounded-xl border border-white/[0.08] p-4 space-y-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-[#e8e8f0]">Brugsstatistik</h2>
        <span className="text-[10px] text-[#8888a0]">hvilke dele af appen bliver faktisk brugt · kun uid, ingen PII</span>
      </div>

      {!loaded ? (
        <p className="text-[11px] text-[#8888a0]">Indlæser…</p>
      ) : stats.total === 0 ? (
        <p className="text-[11px] text-[#8888a0]">
          Ingen events endnu. Hvis du lige har deployet: husk at publicere <code className="text-[#c084fc]">database.rules.json</code> i
          Firebase-konsollen, ellers afvises skrivningerne lydløst.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {tiles.map((t) => (
              <div key={t.k} className={`rounded-lg p-2.5 text-center ${t.warn ? "bg-[rgba(248,113,113,0.1)]" : "bg-white/[0.03]"}`}>
                <div className={`text-xl font-bold tabular-nums ${t.warn ? "text-[#f87171]" : "text-[#e8e8f0]"}`}>{t.v}</div>
                <div className="text-[9px] text-[#8888a0] mt-0.5">{t.k}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <div className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold mb-2">Handlinger</div>
              <div className="space-y-1">
                {stats.byEvent.map(([e, n]) => (
                  <Bar key={e} label={EVENT_LABELS[e] || e} value={n} max={maxEvent} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold mb-2">Mest besøgte sider</div>
              <div className="space-y-1">
                {stats.byRoute.slice(0, 14).map(([r, n]) => (
                  <Bar key={r} label={r} value={n} max={maxRoute} />
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-[#8888a0] uppercase tracking-wider font-semibold mb-2">Aktivitet · sidste 14 dage</div>
            <div className="flex items-end gap-1 h-20">
              {stats.byDay.map(([d, n]) => (
                <div key={d} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d}: ${n}`}>
                  <div className="w-full rounded-t bg-[#a855f7]/70" style={{ height: `${(100 * n) / maxDay}%`, minHeight: n ? 2 : 0 }} />
                  <span className="text-[7px] text-[#8888a0]">{d}</span>
                </div>
              ))}
            </div>
          </div>
          {stats.recentErrors.length > 0 && (
            <div>
              <div className="text-[10px] text-[#f87171] uppercase tracking-wider font-semibold mb-2">Seneste fejl</div>
              <div className="space-y-1">
                {stats.recentErrors.map((e, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-[10px]">
                    <span className="text-[#8888a0] shrink-0 tabular-nums w-20">{new Date(e.ts).toLocaleString("da-DK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="text-[#f87171] shrink-0 font-semibold">{e.ctx}</span>
                    <span className="text-[#c8c8d4] truncate" title={e.msg}>{e.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[9px] text-[#8888a0]">
            {stats.users} unikke brugere i alt. Rå side-trafik ligger også i Vercel Web Analytics (cookieløst).
          </p>
        </>
      )}
    </section>
  );
}
