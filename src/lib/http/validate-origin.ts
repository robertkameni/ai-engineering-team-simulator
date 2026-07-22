/**
 * Origin allowlist for mutating API requests (arch-review F3).
 * Safe methods (GET/HEAD/OPTIONS) skip this check in proxy.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3100",
  "http://127.0.0.1:3100",
] as const;

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

export function isMutatingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function getAllowedOrigins(): ReadonlySet<string> {
  const origins = new Set<string>(LOCAL_DEV_ORIGINS);
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    origins.add(normalizeOrigin(configured));
  }
  return origins;
}

/** True when Origin is allowlisted or matches this request's own origin (CSRF). */
export function isAllowedOrigin(request: Request): boolean {
  const originHeader = request.headers.get("origin");
  if (originHeader == null || originHeader.length === 0) {
    return false;
  }

  const origin = normalizeOrigin(originHeader);
  if (getAllowedOrigins().has(origin)) {
    return true;
  }

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
