"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TEAM_SLUG, TEAM_NAME } from "@/lib/team";

const LINKS: { href: string; label: string; match: (path: string) => boolean }[] = [
  {
    href: "/",
    label: "Matrix",
    match: (p) => p === "/" || p.startsWith("/faction"),
  },
  {
    href: "/roster",
    label: "Roster",
    match: (p) => p.startsWith("/roster"),
  },
  {
    href: "/tournament",
    label: "Turnering",
    match: (p) => p.startsWith("/tournament") || p.startsWith("/coaching"),
  },
  {
    href: "/estimates",
    label: "Estimater",
    match: (p) => p.startsWith("/estimates"),
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

          {/* Desktop links */}
          <div className="hidden sm:flex items-center gap-1 flex-1">
            {LINKS.map((link) => {
              const active = link.match(pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                    active
                      ? "bg-[rgba(168,85,247,0.15)] text-[#c084fc]"
                      : "text-[#8888a0] hover:text-[#e8e8f0] hover:bg-white/[0.04]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
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
          {LINKS.map((link) => {
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
        </div>
      )}
    </nav>
  );
}
