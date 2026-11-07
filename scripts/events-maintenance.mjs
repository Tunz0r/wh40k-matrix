// Daily maintenance for the usage/error log (`events/` in RTDB). Two jobs in one
// sign-in (see docs/ROADMAP.md P0 agents):
//   #1 Error-watch  — if any `error` events in the last 24h, upsert ONE rolling
//                     GitHub issue with a signature breakdown (low-noise: one
//                     issue, at most one comment/day, only on days with errors).
//   #2 Prune        — delete events older than RETAIN_DAYS so the node stays small.
//
// Best-effort: missing creds / failed reads just log and exit 0 (never fail CI,
// never touch anything else). Reuses the MFM bot's REST auth pattern.
import { execFileSync } from "node:child_process";

const KEY = process.env.FIREBASE_API_KEY || "AIzaSyB8Zy8X5JY44SFacjfgb-jU_wWrcVGfP-4";
const DB = process.env.FIREBASE_DB_URL || "https://wtcpairing-default-rtdb.europe-west1.firebasedatabase.app";
const EMAIL = process.env.FIREBASE_BOT_EMAIL;
const PASSWORD = process.env.FIREBASE_BOT_PASSWORD;

const RETAIN_DAYS = Number(process.env.EVENTS_RETAIN_DAYS || 60);
const MAX_EVENTS = Number(process.env.EVENTS_MAX || 50000);
const ISSUE_MARKER = "app-errors"; // in the title, so we can find + reuse the issue
const DAY = 86_400_000;

async function signIn() {
  if (!EMAIL || !PASSWORD) throw new Error("no bot credentials (FIREBASE_BOT_EMAIL/PASSWORD)");
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  }).then((r) => r.json());
  if (!r.idToken) throw new Error("bot sign-in failed: " + JSON.stringify(r.error || r));
  return r.idToken;
}

// --- #1 error-watch ---
function summariseErrors(events, now) {
  const since = now - DAY;
  const errs = events.filter((e) => e.e === "error" && (e.ts || 0) >= since);
  if (!errs.length) return null;
  const bySig = new Map();
  for (const e of errs) {
    const sig = `${e.ctx ?? "?"} — ${e.msg ?? ""}`.slice(0, 160);
    bySig.set(sig, (bySig.get(sig) || 0) + 1);
  }
  const rows = [...bySig.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sig, n]) => `- **${n}×** \`${sig}\``)
    .join("\n");
  const users = new Set(errs.map((e) => e.uid)).size;
  return `**${errs.length}** error event(s) from **${users}** user(s) in the last 24h:\n\n${rows}\n\n_Logged via the in-app usage analytics; details on /admin → Brugsstatistik._`;
}

function upsertIssue(body) {
  try {
    const title = `[${ISSUE_MARKER}] App-fejl opsamlet`;
    const found = JSON.parse(
      execFileSync("gh", ["issue", "list", "--state", "open", "--search", `${ISSUE_MARKER} in:title`, "--json", "number,title"], { encoding: "utf8" }) || "[]"
    ).find((i) => i.title === title);
    const dated = `### ${new Date().toISOString().slice(0, 10)}\n\n${body}`;
    if (found) {
      execFileSync("gh", ["issue", "comment", String(found.number), "--body", dated], { stdio: "inherit" });
      console.log(`error-watch: commented on #${found.number}`);
    } else {
      execFileSync("gh", ["issue", "create", "--title", title, "--body", dated], { stdio: "inherit" });
      console.log("error-watch: opened a new issue");
    }
  } catch (e) {
    console.error("error-watch: could not upsert issue —", e.message);
  }
}

// --- #2 prune ---
async function prune(events, now, token) {
  const cutoff = now - RETAIN_DAYS * DAY;
  let doomed = events.filter((e) => (e.ts || 0) < cutoff);
  // Secondary guard: if still over MAX after the age cut, drop the oldest surplus.
  const kept = events.filter((e) => (e.ts || 0) >= cutoff).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  if (kept.length > MAX_EVENTS) doomed = doomed.concat(kept.slice(0, kept.length - MAX_EVENTS));
  if (!doomed.length) { console.log("prune: nothing to delete"); return; }
  const updates = {};
  for (const e of doomed) updates[e._key] = null;
  const res = await fetch(`${DB}/events.json?auth=${token}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  console.log(res.ok ? `prune: deleted ${doomed.length} event(s)` : `prune: failed (${res.status})`);
}

async function main() {
  let token;
  try { token = await signIn(); } catch (e) { console.error(e.message); return; }
  const raw = await fetch(`${DB}/events.json?auth=${token}`).then((r) => r.json()).catch(() => null);
  if (!raw || typeof raw !== "object") { console.log("no events to process"); return; }
  const events = Object.entries(raw).map(([_key, v]) => ({ _key, ...v }));
  const now = Date.now();
  console.log(`events-maintenance: ${events.length} total`);

  const summary = summariseErrors(events, now);
  if (summary) upsertIssue(summary); else console.log("error-watch: no errors in the last 24h");

  await prune(events, now, token);
}

main().catch((e) => { console.error("events-maintenance failed:", e.message); process.exit(0); });
