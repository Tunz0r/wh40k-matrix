import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, checkCredentials, expectedToken } from "@/lib/auth-server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!checkCredentials(body?.username, body?.password)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await expectedToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days — covers prep and the tournament
  });
  return res;
}
