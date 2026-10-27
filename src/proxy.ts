import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: send visitors without a session cookie to /login.
// Real authentication happens on the server for every API call (see
// lib/server/http.ts) — this never grants access by itself.
const SESSION_COOKIES = ["__Host-fw_session", "fw_session"];

export function proxy(req: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => Boolean(req.cookies.get(name)?.value));
  if (!hasSession) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico|icon.svg|sounds|.*\\.(?:png|svg|ico|webmanifest|txt)$).*)"],
};
