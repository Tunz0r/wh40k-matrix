"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TEAM_NAME } from "@/lib/team";
import { useActiveTournament } from "@/lib/active-tournament";
import { useActivePlayer } from "@/lib/active-player";
import { useAuth } from "@/lib/auth";

type NavLink = { href: string; label: string; match: (path: string) => boolean };

// Core links live directly on the bar; everything else folds into "Mere" so the
// row never wraps. The matrix itself lives on "/" — reached via the brand logo.
const CORE: NavLink[] = [
  { href: "/tournament", label: "Turnering", match: (p) => p.startsWith("/tournament") || p.startsWith("/coaching") },
  { href: "/estimates", label: "Estimater", match: (p) => p.startsWith("/estimates") },
  { href: "/meta", label: "Meta", match: (p) => p.startsWith("/meta") },
  { href: "/team", label: "Team Room", match: (p) => p.startsWith("/team") },
];

const MORE: NavLink[] = [
  { href: "/roster", label: "Roster", match: (p) => p.startsWith("/roster") },
  { href: "/stats", label: "Stats", match: (p) => p.startsWith("/stats") },
  { href: "/sanity", label: "Sanity", match: (p) => p.startsWith("/sanity") },
  { href: "/warmups", label: "Warmups", match: (p) => p.startsWith("/warmups") },
  { href: "/calibration", label: "Kalibrering", match: (p) => p.startsWith("/calibration") },
];

export default function SiteNav() {
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<null | "more" | "user">(null);
  const { active, activeId, activeSlug } = useActiveTournament();
  const activeName = active?.name ?? "Vælg turnering";
  const teamName = active?.teamName ?? TEAM_NAME;
  const { activePlayer, isAdmin, canManage } = useActivePlayer();
  const { user, signOutUser } = useAuth();

  // Close any open menu whenever the route changes.
  useEffect(() => {
    setMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  // Team Room + Turnering follow the active tournament.
  const resolve = (l: NavLink): NavLink => {
    if (l.label === "Team Room") return { ...l, href: `/team/${activeSlug}` };
    if (l.label === "Turnering") return { ...l, href: `/tournament/${activeId}` };
    return l;
  };
  const core = CORE.map(resolve);

  const displayName = user?.displayName?.trim() || activePlayer?.name || "Min konto";
  const initial = displayName.charAt(0).toUpperCase();
  const moreActive = MORE.some((l) => l.match(pathname));

  const linkClass = (isActive: boolean) =>
    `px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
      isActive
        ? "bg-[rgba(168,85,247,0.15)] text-[#c084fc]"
        : "text-[#8888a0] hover:text-[#e8e8f0] hover:bg-white/[0.04]"
    }`;

  return (
    <nav className="sticky top-0 z-50 bg-[#0f0f13]/95 backdrop-blur border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-12 gap-1">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 mr-2 shrink-0">
            <span className="w-6 h-6 rounded-md bg-gradient-to-br from-[#a855f7] to-[#6d28d9] flex items-center justify-center text-[10px] font-black text-white">
              W
            </span>
            <span className="text-[13px] font-semibold text-[#e8e8f0] tracking-tight hidden sm:inline">
              WTC
              <span className="text-[#4ade80] font-normal ml-1.5 hidden lg:inline">{teamName}</span>
            </span>
          </Link>

          {/* Active tournament — click to switch (the /tournament picker) */}
          <Link
            href="/tournament"
            title="Skift turnering"
            className="mr-1 shrink-0 flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border border-white/[0.1] text-[#c084fc] hover:border-[#a855f7]/50 hover:bg-[rgba(168,85,247,0.08)] transition-colors max-w-[150px]"
          >
            <span className="truncate">{activeName}</span>
            <span className="text-[#8888a0] text-[10px] shrink-0">⇄</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden sm:flex items-center gap-0.5 flex-1">
            {core.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass(link.match(pathname))}>
                {link.label}
              </Link>
            ))}

            {/* Mere ▾ overflow */}
            <div className="relative">
              <button
                onClick={() => setMenu(menu === "more" ? null : "more")}
                className={linkClass(moreActive || menu === "more")}
                aria-haspopup="menu"
                aria-expanded={menu === "more"}
              >
                Mere <span className="text-[9px] text-[#8888a0]">▾</span>
              </button>
              {menu === "more" && (
                <div className="absolute left-0 mt-1 w-44 rounded-lg border border-white/[0.1] bg-[#16161d] shadow-xl shadow-black/40 py-1 z-50">
                  {MORE.map((link) => {
                    const isActive = link.match(pathname);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`block px-3 py-2 text-[12px] font-medium transition-colors ${
                          isActive
                            ? "text-[#c084fc] bg-[rgba(168,85,247,0.1)]"
                            : "text-[#c8c8d8] hover:text-[#e8e8f0] hover:bg-white/[0.05]"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Identity menu (right) */}
            <div className="relative ml-auto">
              <button
                onClick={() => setMenu(menu === "user" ? null : "user")}
                title={displayName}
                aria-haspopup="menu"
                aria-expanded={menu === "user"}
                className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-md border border-white/[0.1] hover:border-white/[0.22] transition-colors"
              >
                <span className="w-5 h-5 rounded-full bg-[#4ade80]/15 text-[#4ade80] flex items-center justify-center text-[10px] font-bold shrink-0">
                  {initial}
                </span>
                <span className="text-[12px] font-medium text-[#e8e8f0] max-w-[110px] truncate">{displayName}</span>
                <span className="text-[9px] text-[#8888a0]">▾</span>
              </button>
              {menu === "user" && (
                <div className="absolute right-0 mt-1 w-48 rounded-lg border border-white/[0.1] bg-[#16161d] shadow-xl shadow-black/40 py-1 z-50">
                  <Link
                    href="/player"
                    className={`block px-3 py-2 text-[12px] font-medium transition-colors ${
                      pathname.startsWith("/player")
                        ? "text-[#c084fc] bg-[rgba(168,85,247,0.1)]"
                        : "text-[#c8c8d8] hover:text-[#e8e8f0] hover:bg-white/[0.05]"
                    }`}
                  >
                    Min side
                  </Link>
                  {canManage && (
                    <Link
                      href="/manage"
                      className={`block px-3 py-2 text-[12px] font-medium transition-colors ${
                        pathname.startsWith("/manage")
                          ? "text-[#c084fc] bg-[rgba(168,85,247,0.1)]"
                          : "text-[#c8c8d8] hover:text-[#e8e8f0] hover:bg-white/[0.05]"
                      }`}
                    >
                      Administrér hold
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      href="/admin"
                      className={`block px-3 py-2 text-[12px] font-medium transition-colors ${
                        pathname.startsWith("/admin")
                          ? "text-[#f0b429] bg-[rgba(240,180,41,0.12)]"
                          : "text-[#f0b429]/90 hover:text-[#f0b429] hover:bg-white/[0.05]"
                      }`}
                    >
                      Admin
                    </Link>
                  )}
                  <div className="my-1 border-t border-white/[0.07]" />
                  <button
                    onClick={() => signOutUser()}
                    className="block w-full text-left px-3 py-2 text-[12px] font-medium text-[#8888a0] hover:text-[#f87171] hover:bg-white/[0.05] transition-colors"
                  >
                    Log ud
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Luk menu" : "Åbn menu"}
            aria-expanded={mobileOpen}
            className="sm:hidden ml-auto w-9 h-9 flex flex-col items-center justify-center gap-[5px] rounded-md hover:bg-white/[0.06] transition-colors"
          >
            <span className={`block w-[18px] h-[2px] rounded bg-[#e8e8f0] transition-transform duration-200 ${mobileOpen ? "translate-y-[7px] rotate-45" : ""}`} />
            <span className={`block w-[18px] h-[2px] rounded bg-[#e8e8f0] transition-opacity duration-200 ${mobileOpen ? "opacity-0" : ""}`} />
            <span className={`block w-[18px] h-[2px] rounded bg-[#e8e8f0] transition-transform duration-200 ${mobileOpen ? "-translate-y-[7px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      {/* Click-away backdrop for the desktop dropdowns */}
      {menu && <button aria-hidden tabIndex={-1} onClick={() => setMenu(null)} className="hidden sm:block fixed inset-0 z-40 cursor-default" />}

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-white/[0.06] px-3 py-2 space-y-0.5 bg-[#0f0f13]">
          <div className="flex items-center gap-2 px-3 py-2 mb-1">
            <span className="w-6 h-6 rounded-full bg-[#4ade80]/15 text-[#4ade80] flex items-center justify-center text-[11px] font-bold">{initial}</span>
            <span className="text-[13px] font-medium text-[#e8e8f0] truncate">{displayName}</span>
          </div>
          {[...core, ...MORE].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${
                link.match(pathname)
                  ? "bg-[rgba(168,85,247,0.15)] text-[#c084fc]"
                  : "text-[#8888a0] hover:text-[#e8e8f0] hover:bg-white/[0.04]"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/player"
            className={`block px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${
              pathname.startsWith("/player") ? "bg-[rgba(168,85,247,0.15)] text-[#c084fc]" : "text-[#8888a0] hover:text-[#e8e8f0] hover:bg-white/[0.04]"
            }`}
          >
            Min side
          </Link>
          {canManage && (
            <Link href="/manage" className="block px-3 py-2.5 rounded-md text-[13px] font-medium text-[#c084fc] hover:bg-white/[0.04] transition-colors">
              Administrér hold
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin" className="block px-3 py-2.5 rounded-md text-[13px] font-medium text-[#f0b429] hover:bg-white/[0.04] transition-colors">
              Admin
            </Link>
          )}
          <button
            onClick={() => signOutUser()}
            className="block w-full text-left px-3 py-2.5 rounded-md text-[13px] font-medium text-[#8888a0] hover:text-[#f87171] hover:bg-white/[0.04] transition-colors"
          >
            Log ud
          </button>
        </div>
      )}
    </nav>
  );
}
