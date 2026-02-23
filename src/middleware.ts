import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MOCK_USER_COOKIE = "dms_mock_user_id";
const LOGIN_PATH = "/login";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === LOGIN_PATH) {
    const cookie = request.cookies.get(MOCK_USER_COOKIE);
    if (cookie?.value) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard") || pathname === "/inbox" || pathname === "/documents" || pathname === "/workflows" || pathname === "/reports" || pathname === "/audit" || pathname.startsWith("/admin")) {
    const cookie = request.cookies.get(MOCK_USER_COOKIE);
    if (!cookie?.value) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/inbox", "/inbox/:path*", "/documents", "/documents/:path*", "/workflows", "/workflows/:path*", "/reports", "/audit", "/admin", "/admin/:path*", "/login"],
};
