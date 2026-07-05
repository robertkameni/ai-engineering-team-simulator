import type { RateLimitResult } from "../../lib/rate-limit-config.js";

export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return Response.json(
    { error: result.error, retryAfter: result.retryAfterSec },
    {
      status: result.status,
      headers:
        result.status === 429
          ? { "Retry-After": String(result.retryAfterSec) }
          : undefined,
    },
  );
}
