"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";
import { useActiveTournament } from "@/lib/active-tournament";
import { useActivePlayer } from "@/lib/active-player";
import { useAuth } from "@/lib/auth";

// The matrix itself lives on "/" — reachable via the brand logo, so it
// doesn't need its own nav item.
const LINKS: { href: string; label: string; match: (path: string) => boolean }[] = [
  {
    href: "/roster",
    label: "Roster",
    match: (p) => p.startsWith("/roster"),
  },
  {
    href: "/tournament",
    label: "Turnering",
    match: (p) => p.startsWith("/tournament") || p.startsWith("/coaching") || p.startsWith("/calibration") || p.startsWith("/warmups"),
  },
  {
    href: "/estimates",
    label: "Estimater",
    match: (p) => p.startsWith("/estimates"),
  },
  {
    href: "/meta",
    label: "Meta",
    match: (p) => p.startsWith("/meta"),
  },
  {
    href: "/sanity",
    label: "Sanity",
    match: (p) => p.startsWith("/sanity"),
  },
  {
    href: "/stats",
    label: "Stats",
    match: (p) => p.startsWith("/stats"),
  },
  {
    href: "/player",
    label: "Min side",
    match: (p) => p.startsWith("/player"),
  },
  {
    href: `/team/${TEAM_SLUG}`,
    label: "Team Room",
    match: (p) => p.startsWith("/team"),
  },
];

export default function SiteNav() {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const { active, activeId, activeSlug } = useActiveTournament();
  const activeName = active?.name ?? "Vælg turnering";
  const { players, activePlayer, activePlayerId, setActivePlayer, isAdmin } = useActivePlayer();
  const { signOutUser } = useAuth();
  // Team Room + Turnering follow the active tournament; others are static.
  const links = LINKS.map((l) => {
    if (l.label === "Team Room") return { ...l, href: `/team/${activeSlug}` };
    if (l.label === "Turnering") return { ...l, href: `/tournament/${activeId}` };
    return l;
  });

  return (
    <nav className="sticky top-0 z-50 bg-[#0f0f13]/95 backdrop-blur border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-12 gap-1">
          {/* Brand */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 mr-3 shrink-0"
          >
            <span className="w-6 h-6 rounded-md bg-gradient-to-br from-[#a855f7] to-[#6d28d9] flex items-center justify-center text-[10px] font-black text-white">
              W
            </span>
            <span className="text-[13px] font-semibold text-[#e8e8f0] tracking-tight hidden xs:inline sm:inline">
              WTC
              <span className="text-[#4ade80] font-normal ml-1.5 hidden md:inline">
                {TEAM_NAME}
              </span>
            </span>
          </Link>

          {/* Active tournament — click to switch (the /tournament picker) */}
          <Link
            href="/tournament"
            onClick={() => setOpen(false)}
            title="Skift turnering"
            className="mr-1.5 shrink-0 flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border border-white/[0.1] text-[#c084fc] hover:border-[#a855f7]/50 hover:bg-[rgba(168,85,247,0.08)] transition-colors max-w-[150px]"
          >
            <span className="truncate">{activeName}</span>
            <span className="text-[#8888a0] text-[10px] shrink-0">⇄</span>
          </Link>

          {/* Identity. Admins get an override <select> (act as any player);
              a normal player sees a fixed chip of who they're logged in as. */}
          {isAdmin ? (
            <select
              value={activePlayerId ?? ""}
              onChange={(e) => setActivePlayer(e.target.value || null)}
              title="Optræd som spiller (admin)"
              className="mr-2 shrink-0 text-[11px] font-medium px-1.5 py-1 rounded-md border border-[#f0b429]/40 bg-[#1a1a22] text-[#f0b429] outline-none focus:border-[#f0b429] max-w-[130px]"
            >
              <option value="">Admin</option>
              {players.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#1a1a22] text-[#e8e8f0]">
                  {p.name}
                </option>
              ))}
            </select>
          ) : activePlayer ? (
            <span
              title="Du er logget ind som denne spiller"
              className="mr-2 shrink-0 text-[11px] font-medium px-2 py-1 rounded-md border border-white/[0.1] bg-[#1a1a22] text-[#4ade80] max-w-[120px] truncate"
            >
              {activePlayer.name}
            </span>
          ) : null}

          {/* Desktop links */}
          <div className="hidden sm:flex items-center gap-1 flex-1">
            {links.map((link) => {
              const active = link.match(pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-2 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                    active
                      ? "bg-[rgba(168,85,247,0.15)] text-[#c084fc]"
                      : "text-[#8888a0] hover:text-[#e8e8f0] hover:bg-white/[0.04]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className={`px-2 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-[rgba(240,180,41,0.15)] text-[#f0b429]"
                    : "text-[#8888a0] hover:text-[#e8e8f0] hover:bg-white/[0.04]"
                }`}
              >
                Admin
              </Link>
            )}
            <button
              onClick={() => signOutUser()}
              title="Log ud"
              className="ml-auto px-2 py-1.5 rounded-md text-[12px] font-medium text-[#8888a0] hover:text-[#f87171] hover:bg-white/[0.04] transition-colors"
            >
              Log ud
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(!open)}
            aria-label={open ? "Luk menu" : "Åbn menu"}
            aria-expanded={open}
            className="sm:hidden ml-auto w-9 h-9 flex flex-col items-center justify-center gap-[5px] rounded-md hover:bg-white/[0.06] transition-colors"
          >
            <span
              className={`block w-[18px] h-[2px] rounded bg-[#e8e8f0] transition-transform duration-200 ${open ? "translate-y-[7px] rotate-45" : ""}`}
            />
            <span
              className={`block w-[18px] h-[2px] rounded bg-[#e8e8f0] transition-opacity duration-200 ${open ? "opacity-0" : ""}`}
            />
            <span
              className={`block w-[18px] h-[2px] rounded bg-[#e8e8f0] transition-transform duration-200 ${open ? "-translate-y-[7px] -rotate-45" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="sm:hidden border-t border-white/[0.06] px-3 py-2 space-y-0.5 bg-[#0f0f13]">
          {links.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[rgba(168,85,247,0.15)] text-[#c084fc]"
                    : "text-[#8888a0] hover:text-[#e8e8f0] hover:bg-white/[0.04]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 rounded-md text-[13px] font-medium text-[#f0b429] hover:bg-white/[0.04] transition-colors"
            >
              Admin
            </Link>
          )}
          <button
            onClick={() => {
              setOpen(false);
              signOutUser();
            }}
            className="block w-full text-left px-3 py-2.5 rounded-md text-[13px] font-medium text-[#8888a0] hover:text-[#f87171] hover:bg-white/[0.04] transition-colors"
          >
            Log ud
          </button>
        </div>
      )}
    </nav>
  );
}
