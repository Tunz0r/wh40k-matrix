import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, expectedToken } from "@/lib/auth-server";

// Server-side gate: every page and API request needs the auth cookie,
// otherwise it is redirected to /login before anything is rendered.
export default async function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (token && token === (await expectedToken())) {
    return NextResponse.next();
  }
  const login = new URL("/login", request.url);
  const from = request.nextUrl.pathname + request.nextUrl.search;
  if (from && from !== "/") login.searchParams.set("from", from);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Everything except the login page/route, Next internals, and static assets
    "/((?!login|api/login|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)",
  ],
};
