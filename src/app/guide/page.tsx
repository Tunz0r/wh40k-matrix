import Link from "next/link";

// A numbered marker pinned onto a screenshot, pointing down at its target.
// x/y are percentages of the image (0–100); the pointer tip sits at (x, y).
function Pin({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <span
      className="absolute z-10 flex flex-col items-center"
      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -100%)" }}
    >
      <span className="w-[22px] h-[22px] rounded-full bg-[#a855f7] border-2 border-[#0f0f13] text-white text-[11px] font-black flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
        {n}
      </span>
      <span className="w-0 h-0 -mt-px border-l-[5px] border-r-[5px] border-t-[8px] border-l-transparent border-r-transparent border-t-[#a855f7]" />
    </span>
  );
}

function Legend({ items }: { items: string[] }) {
  return (
    <ol className="mt-3 space-y-1.5">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2 text-[12px] text-[#c8c8d8]">
          <span className="mt-[1px] w-[18px] h-[18px] shrink-0 rounded-full bg-[rgba(168,85,247,0.18)] text-[#c084fc] text-[10px] font-black flex items-center justify-center">
            {i + 1}
          </span>
          <span dangerouslySetInnerHTML={{ __html: t }} />
        </li>
      ))}
    </ol>
  );
}

// Screenshots are 1568×744 but the app page often fills only the top; `crop` is
// the fraction of image height to show (bottom dead space hidden via overflow).
// Pin y-coords stay in FULL-image % and are rescaled by crop here.
function Figure({
  src,
  alt,
  pins,
  legend,
  crop = 1,
}: {
  src: string;
  alt: string;
  pins: { x: number; y: number }[];
  legend: string[];
  crop?: number;
}) {
  return (
    <figure className="mt-4">
      <div
        className="relative rounded-xl overflow-hidden border border-white/[0.1] bg-[#0b0b0e]"
        style={{ aspectRatio: `1568 / ${Math.round(744 * crop)}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="absolute top-0 left-0 w-full" />
        {pins.map((p, i) => (
          <Pin key={i} n={i + 1} x={p.x} y={p.y / crop} />
        ))}
      </div>
      <Legend items={legend} />
    </figure>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-[#a855f7] to-[#6d28d9] text-white text-[13px] font-black flex items-center justify-center">
        {n}
      </span>
      <div>
        <h3 className="text-[13px] font-semibold text-[#e8e8f0]">{title}</h3>
        <p className="text-[12px] text-[#9a9aad] leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function Flag({ icon, name, desc }: { icon: string; name: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-white/[0.08] bg-[#131318] px-3 py-2">
      <span className="text-[16px] leading-none mt-0.5">{icon}</span>
      <div>
        <div className="text-[12px] font-semibold text-[#e8e8f0]">{name}</div>
        <div className="text-[11px] text-[#8888a0] leading-snug">{desc}</div>
      </div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2.5 mb-2">
          <span className="w-8 h-8 rounded-md bg-gradient-to-br from-[#a855f7] to-[#6d28d9] flex items-center justify-center text-[14px] font-black text-white">
            W
          </span>
          <h1 className="text-xl font-bold text-[#e8e8f0] tracking-tight">Sådan bruger du appen</h1>
        </div>
        <p className="text-[13px] text-[#9a9aad] leading-relaxed max-w-2xl">
          Et værktøj til at forberede <strong className="text-[#c8c8d8]">holdturneringer i Warhammer 40.000</strong>: byg
          holdet, estimér hver matchup mod modstandernes lister, og kør selve turneringsdagen med parring og live
          coaching. Som <strong className="text-[#c8c8d8]">kaptajn</strong> styrer du holdet og hele matrixen; som{" "}
          <strong className="text-[#c8c8d8]">spiller</strong> vælger du din plads og udfylder dine egne estimater.
        </p>
      </header>

      {/* 1. Kom i gang */}
      <section>
        <h2 className="text-[15px] font-semibold text-[#e8e8f0] border-b border-white/[0.08] pb-2 mb-4">
          1 · Kom i gang
        </h2>
        <div className="space-y-4">
          <Step n={1} title="Tilmeld dit hold til et event">
            Under <span className="text-[#c084fc]">Turnering</span> ser du de events, der er oprettet. Tryk{" "}
            <em>Tilmeld dit hold</em> på det rigtige event — eller opret et nyt med{" "}
            <em>+ Nyt event</em>. (Enkelt-hold uden event kan oprettes nederst.)
          </Step>
          <Step n={2} title="Invitér holdet">
            Gå til <span className="text-[#c084fc]">Administrér hold</span> (under dit navn øverst til højre), sæt
            holdstørrelsen, åbn tilmelding og del linket. Spillerne logger ind, skriver deres navn og vælger en plads —
            så er de med med det samme. Du kan også sætte folk på pladser manuelt.
          </Step>
          <Step n={3} title="Hver spiller vælger sin hær">
            På <span className="text-[#c084fc]">Min side</span> vælger spilleren sin hær (faction + detachment) eller
            uploader sit liste-export. Så er holdet klar til at blive estimeret.
          </Step>
        </div>

        <Figure
          src="/guide/events.jpg"
          alt="Turnerings-oversigten med events"
          crop={0.66}
          pins={[
            { x: 41, y: 37.5 },
            { x: 62.8, y: 11 },
          ]}
          legend={[
            "<strong>Tilmeld dit hold</strong> til et event — dit hold vises i grønt når du er tilmeldt.",
            "<strong>+ Nyt event</strong> opretter et nyt event, som andre hold kan tilmelde sig.",
          ]}
        />
      </section>

      {/* 2. Estimat-matrixen */}
      <section>
        <h2 className="text-[15px] font-semibold text-[#e8e8f0] border-b border-white/[0.08] pb-2 mb-4">
          2 · Estimat-matrixen — appens hjerte
        </h2>
        <p className="text-[12px] text-[#9a9aad] leading-relaxed mb-1">
          Hver celle er dit estimat for én af <strong className="text-[#c8c8d8]">jeres</strong> hære mod én af{" "}
          <strong className="text-[#c8c8d8]">deres</strong> lister, på WTC-skalaen{" "}
          <strong className="text-[#c8c8d8]">0–20</strong> (10 = lige kamp). Farven viser hvor godt/skidt: rød er svær,
          grøn er god. Estimater kan auto-udfyldes fra lignende lister og justeres efter disposition.
        </p>

        <Figure
          src="/guide/matrix.jpg"
          alt="Estimat-matrixen for et land"
          pins={[
            { x: 9.5, y: 9.8 },
            { x: 40, y: 33.5 },
            { x: 65, y: 26 },
            { x: 32, y: 15.6 },
          ]}
          legend={[
            "<strong>Farve-forklaring (0–20):</strong> Meget dårlig · Dårlig · Lige · God · Meget god.",
            "<strong>En celle</strong> = estimatet (0–20) for den matchup. Klik og skriv for at rette; små ikoner markerer flag (se nedenfor).",
            "<strong>Åbn/Luk matrix</strong> pr. land, og <em>Opdater lists</em> når de rigtige lister kommer.",
            "<strong>Importér alle lists til eventet</strong> — indsæt ét dokument, så får alle deltagende hold listerne på én gang.",
          ]}
        />

        <div className="mt-5">
          <h3 className="text-[12px] font-semibold text-[#c8c8d8] mb-2">Flag på en celle (klik ikonerne ved estimatet)</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            <Flag icon="🧪" name="Skal testes" desc="Usikkert gæt — vi vil playteste det før vi stoler på tallet." />
            <Flag icon="⚡" name="Svingende" desc="Polariseret resultat (fx 2-18 / 18-2), ikke en rolig 10-10." />
            <Flag icon="🗺️" name="Bord-afhængig" desc="Udfaldet svinger meget på bordet/terrænet — vælg bord omhyggeligt." />
            <Flag icon="🎲" name="Start-afhængig" desc="Afhænger af hvem der får første tur — vægt hvem der starter." />
          </div>
        </div>
      </section>

      {/* 3. Turneringsdagen */}
      <section>
        <h2 className="text-[15px] font-semibold text-[#e8e8f0] border-b border-white/[0.08] pb-2 mb-4">
          3 · Turneringsdagen
        </h2>
        <p className="text-[12px] text-[#9a9aad] leading-relaxed mb-1">
          Dashboardet under <span className="text-[#c084fc]">Turnering</span> samler holdets parathed, runderne og
          team-room-linket. Start en runde, vælg modstander, par hærene igennem (Initial Skirmish → Main Engagement →
          Champion) og åbn team room, hvor coaches følger med live.
        </p>

        <Figure
          src="/guide/dashboard.jpg"
          alt="Turnerings-dashboardet for et hold"
          crop={0.89}
          pins={[
            { x: 31, y: 16 },
            { x: 30.5, y: 41 },
            { x: 33.8, y: 75.9 },
            { x: 34.6, y: 82.7 },
          ]}
          legend={[
            "<strong>Hold-parathed</strong> — hvem er på holdet, og hvor langt I er med estimater (tæller kun faktisk tilmeldte spillere).",
            "<strong>Upload liste</strong> pr. plads — indsæt spillerens liste-export (GW-app, WTC eller NewRecruit).",
            "<strong>Start runde</strong> kører en rigtig runde. <strong>Øve-runde</strong> parrer mod et hvilket som helst hold uden at låse jeres estimater.",
            "<strong>Team room-link</strong> — del med coaches; det opdateres live under kampene.",
          ]}
        />
      </section>

      {/* 4. Roller + tips */}
      <section>
        <h2 className="text-[15px] font-semibold text-[#e8e8f0] border-b border-white/[0.08] pb-2 mb-4">
          4 · Roller & gode genveje
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/[0.08] bg-[#131318] p-3">
            <div className="text-[12px] font-semibold text-[#4ade80] mb-1">Kaptajn</div>
            <p className="text-[11px] text-[#8888a0] leading-relaxed">
              Administrerer holdet, hele estimat-matrixen, seeding, parring og runder. Ser alle værktøjer under{" "}
              <span className="text-[#c8c8d8]">Mere</span>.
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#131318] p-3">
            <div className="text-[12px] font-semibold text-[#4ade80] mb-1">Spiller</div>
            <p className="text-[11px] text-[#8888a0] leading-relaxed">
              Vælger sin plads og hær, udfylder egne estimater under <span className="text-[#c8c8d8]">Estimater</span> (Min
              hær), og logger træningskampe på <span className="text-[#c8c8d8]">Min side</span>.
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#131318] p-3">
            <div className="text-[12px] font-semibold text-[#4ade80] mb-1">Coach</div>
            <p className="text-[11px] text-[#8888a0] leading-relaxed">
              Følger team room live under en runde og hjælper med beslutninger — uden at kunne ændre holdets opsætning.
            </p>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-[#131318] p-3">
            <div className="text-[12px] font-semibold text-[#f0b429] mb-1">Hurtige genveje</div>
            <ul className="text-[11px] text-[#8888a0] leading-relaxed list-disc pl-4 space-y-0.5">
              <li>Holdstørrelse ændres på <span className="text-[#c8c8d8]">Administrér hold</span>.</li>
              <li>Skift mellem flere turneringer med ⇄-vælgeren i baren.</li>
              <li><span className="text-[#c8c8d8]">Præcision</span> viser hvor godt dine estimater rammer.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="pt-2 border-t border-white/[0.08]">
        <Link
          href="/tournament"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#a855f7] hover:bg-[#9333ea] px-4 py-2 rounded-lg transition-colors"
        >
          Kom i gang → Turnering
        </Link>
      </footer>
    </div>
  );
}
