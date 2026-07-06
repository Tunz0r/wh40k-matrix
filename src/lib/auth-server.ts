// Server-only auth helpers — imported by the proxy and the login route,
// never by client components.
//
// Credentials come from env vars so they don't live in the (public) repo;
// the fallback keeps local dev working.
const USER = process.env.WTC_USER || "dk";
const PASS = process.env.WTC_PASS || "12x";

export const AUTH_COOKIE = "wtc-auth";

export function checkCredentials(username: unknown, password: unknown): boolean {
  return username === USER && password === PASS;
}

// The cookie value is a digest of the credentials, so it isn't a constant
// readable from the repo and changes if the credentials are rotated.
export async function expectedToken(): Promise<string> {
  const data = new TextEncoder().encode(`${USER}:${PASS}:wtc-team-room-v1`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
