import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  isAllowedOrigin,
  isMutatingMethod,
} from "@/lib/http/validate-origin";

/**
 * Next.js 16 Proxy (formerly middleware) — Origin gate for mutating /api routes.
 * Arch-review F3. Server Actions are outside matcher and unaffected.
 */
export function proxy(request: NextRequest) {
  if (isMutatingMethod(request.method) && !isAllowedOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
