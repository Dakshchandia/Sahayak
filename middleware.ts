import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/cover",
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/_next",
  "/favicon",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths without auth check
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/.test(pathname)) {
    return NextResponse.next();
  }

  // Check session cookie â€” full validation happens server-side in each route
  const sessionCookie = request.cookies.get("sahayak_session");
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
