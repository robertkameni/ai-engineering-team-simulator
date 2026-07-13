import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

import { getGuestSessionId } from "@/lib/auth/guest-session";
import {
  getRateLimitThreshold,
  type RateLimitAction,
  type RateLimitResult,
} from "@/lib/rate-limit-config";
import {
  applyRateLimitCheck,
  preflightRateLimit,
} from "@/lib/rate-limit-execution";
import { getRedis } from "@/lib/rate-limit-redis";

export { rateLimitResponse } from "@/lib/rate-limit-response";

export type { RateLimitAction, RateLimitResult } from "@/lib/rate-limit-config";

export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function getClientIp(request: Request): string {
  return getClientIpFromHeaders(request.headers);
}

async function resolveRateLimitIdentifier(
  request: Request,
  userId?: string | null,
): Promise<string> {
  if (userId) {
    return `user:${userId}`;
  }

  const ip = getClientIp(request);
  if (ip !== "unknown") {
    return `ip:${ip}`;
  }

  const guestSessionId = await getGuestSessionId();
  if (guestSessionId) {
    return `guest:${guestSessionId}`;
  }

  return "global:unknown";
}

const limiterCache = new Map<string, Ratelimit>();

function getLimiter(action: RateLimitAction, authenticated: boolean): Ratelimit {
  const redis = getRedis();
  if (!redis) {
    throw new Error("Redis client unavailable");
  }

  const cacheKey = `${action}:${authenticated ? "auth" : "guest"}`;
  const existing = limiterCache.get(cacheKey);
  if (existing) return existing;

  const limit = getRateLimitThreshold(action, authenticated);
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, "1 h"),
    prefix: `team-sim:${action}`,
    analytics: false,
  });

  limiterCache.set(cacheKey, limiter);
  return limiter;
}

export async function assertRateLimit(
  request: Request,
  action: RateLimitAction,
  userId?: string | null,
): Promise<RateLimitResult> {
  const preflight = preflightRateLimit({
    missingConfigLogMessage: "Rate limiting unavailable: missing Upstash Redis env",
    devSkipLogMessage: "Rate limiting skipped: UPSTASH_REDIS_REST_* not configured",
  });
  if (!preflight.shouldLimit) {
    return preflight.result;
  }

  const authenticated = Boolean(userId);
  const identifier = await resolveRateLimitIdentifier(request, userId);
  const limiter = getLimiter(action, authenticated);

  return applyRateLimitCheck(
    limiter,
    identifier,
    "Rate limit check failed:",
  );
}
