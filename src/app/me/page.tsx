"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { subscribeToMyTournaments } from "@/lib/membership";
import type { TournamentMeta } from "@/lib/tournaments-registry";
import {
  gatherMyCalibration,
  computeBias,
  bucketBias,
  factionKey,
  archetypeKey,
  type CalibGame,
} from "@/lib/calibration";

// Mean signed error → color. Well-calibrated (near 0) is green; over-rating your
// matchups (you score LESS than you guessed) is the dangerous bias -> red;
// under-rating (you score more) -> amber.
function meanColor(mean: number, n: number): string {
  if (n === 0) return "#8888a0";
  if (Math.abs(mean) <= 1.5) return "#4ade80";
  return mean < 0 ? "#f87171" : "#facc15";
}
const fmtMean = (m: number) => `${m > 0 ? "+" : ""}${m.toFixed(1)}`;

function BiasChip({ n, mean, abs }: { n: number; mean: number; abs: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]">
      <span className="font-bold tabular-nums" style={{ color: meanColor(mean, n) }}>{fmtMean(mean)}</span>
      <span className="text-[#8888a0]">± {abs.toFixed(1)}</span>
      <span className="text-[#8888a0]">· {n} {n === 1 ? "kamp" : "kampe"}</span>
    </span>
  );
}

export default function MyCalibrationPage() {
  const { user } = useAuth();
  const [metas, setMetas] = useState<TournamentMeta[]>([]);
  const [games, setGames] = useState<CalibGame[] | null>(null);

  useEffect(() => (user?.uid ? subscribeToMyTournaments(user.uid, setMetas) : undefined), [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGames(null);
    gatherMyCalibration(user.uid, metas).then((g) => { if (live) setGames(g); }).catch(() => { if (live) setGames([]); });
    return () => { live = false; };
  }, [user?.uid, metas]);

  const overall = useMemo(() => computeBias(games || []), [games]);
  const byFaction = useMemo(() => bucketBias(games || [], factionKey), [games]);
  const byArchetype = useMemo(() => bucketBias(games || [], archetypeKey).filter((b) => b.bias.n >= 2), [games]);
  const sourceCounts = useMemo(() => {
    const w = (games || []).filter((g) => g.source === "warmup").length;
    return { warmup: w, tournament: (games || []).length - w };
  }, [games]);

  return (
    <>
      <header className="px-4 sm:px-6 py-4 border-b border-white/[0.08] sticky top-12 bg-[#0f0f13] z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold text-[#e8e8f0] tracking-tight">Min træfsikkerhed</h1>
          <span className="text-[11px] text-[#8888a0]">estimat vs. faktisk · på tværs af alle dine events</span>
        </div>
      </header>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
        {games === null ? (
          <div className="flex items-center gap-2 text-[12px] text-[#8888a0]">
            <div className="w-4 h-4 rounded-full border-2 border-white/[0.15] border-t-[#a855f7] animate-spin" />
            Samler dine kampe fra alle events…
          </div>
        ) : games.length === 0 ? (
          <p className="text-[12px] text-[#8888a0] leading-relaxed">
            Ingen kampe med et estimat endnu. Log warmup-kampe på <span className="text-[#c8c8d8]">Min side</span> (med
            estimat + faktisk resultat), eller spil turneringsrunder — så dukker din træfsikkerhed op her.
          </p>
        ) : (
          <>
            {/* Overall */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">Samlet bias</h2>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-3xl font-bold tabular-nums" style={{ color: meanColor(overall.mean, overall.n) }}>
                  {fmtMean(overall.mean)}
                </span>
                <span className="text-[12px] text-[#8888a0]">BP i snit · spredning ± {overall.abs.toFixed(1)} · {overall.n} kampe</span>
              </div>
              <p className="text-[11px] text-[#8888a0] mt-2 leading-relaxed">
                {Math.abs(overall.mean) <= 1.5
                  ? "Du er godt kalibreret — dine estimater rammer i snit tæt på det faktiske resultat."
                  : overall.mean > 0
                  ? `Du undervurderer i snit dine matchups: du scorer ${fmtMean(overall.mean)} BP MERE end du estimerer.`
                  : `Du overvurderer i snit dine matchups: du scorer ${Math.abs(overall.mean).toFixed(1)} BP MINDRE end du estimerer.`}
              </p>
              <p className="text-[10px] text-[#8888a0] mt-1">
                {sourceCounts.warmup} warmup · {sourceCounts.tournament} turneringskampe
              </p>
            </div>

            {/* Per opponent archetype */}
            {byArchetype.length > 0 && (
              <div className="rounded-xl border border-white/[0.08] p-4">
                <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">Pr. modstander-arketype (≥2 kampe)</h2>
                <div className="space-y-1">
                  {byArchetype.map((b) => (
                    <div key={b.key} className="flex items-center gap-2 rounded-lg border border-white/[0.05] px-2.5 py-1.5">
                      <span className="text-[11px] text-[#e8e8f0] flex-1 min-w-0 truncate">{b.key}</span>
                      <BiasChip {...b.bias} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per opponent faction */}
            <div className="rounded-xl border border-white/[0.08] p-4">
              <h2 className="text-xs font-semibold text-[#8888a0] uppercase tracking-wider mb-2">Pr. modstander-faction</h2>
              <div className="space-y-1">
                {byFaction.map((b) => (
                  <div key={b.key} className="flex items-center gap-2 rounded-lg border border-white/[0.05] px-2.5 py-1.5">
                    <span className="text-[11px] text-[#e8e8f0] flex-1 min-w-0 truncate">{b.key}</span>
                    <BiasChip {...b.bias} />
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-[#8888a0] leading-relaxed">
              Bias = faktisk − estimat. <span className="text-[#facc15]">Positiv</span> = du scorer mere end du gætter (undervurderer);
              <span className="text-[#f87171]"> negativ</span> = du scorer mindre (overvurderer). ± er den gennemsnitlige afvigelse (spredning).
            </p>
          </>
        )}
      </div>
    </>
  );
}
