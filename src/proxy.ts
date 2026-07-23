import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  buildContentSecurityPolicy,
  createCspNonce,
} from "@/lib/http/content-security-policy";
import {
  isAllowedOrigin,
  isMutatingMethod,
} from "@/lib/http/validate-origin";

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function applyNonceContentSecurityPolicy(
  request: NextRequest,
): NextResponse {
  const nonce = createCspNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

/**
 * Next.js 16 Proxy (formerly middleware):
 * - Origin gate for mutating /api routes (arch-review F3)
 * - Per-request CSP nonce for document routes (F3 follow-up / Sprint 4)
 */
export function proxy(request: NextRequest) {
  if (isApiPath(request.nextUrl.pathname)) {
    if (isMutatingMethod(request.method) && !isAllowedOrigin(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.next();
  }

  return applyNonceContentSecurityPolicy(request);
}

export const config = {
  matcher: [
    "/api/:path*",
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
