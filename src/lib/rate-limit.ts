import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { getGuestSessionId } from "@/lib/auth/guest-session";
import {
  getRateLimitThreshold,
  type RateLimitAction,
  type RateLimitResult,
} from "@/lib/rate-limit-config";

export type { RateLimitAction, RateLimitResult } from "@/lib/rate-limit-config";
export { getRateLimitThreshold } from "@/lib/rate-limit-config";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isRateLimitDisabled(): boolean {
  if (process.env.RATE_LIMIT_DISABLED === "true") return true;
  if (
    process.env.NODE_ENV === "development" &&
    process.env.RATE_LIMIT_ENABLED_IN_DEV !== "true"
  ) {
    return true;
  }
  return false;
}

function hasRedisConfig(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

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

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!hasRedisConfig()) return null;
  if (!redisClient) {
    redisClient = Redis.fromEnv();
  }
  return redisClient;
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
  if (isRateLimitDisabled()) {
    return { ok: true };
  }

  if (!hasRedisConfig()) {
    if (isProduction()) {
      console.error("Rate limiting unavailable: missing Upstash Redis env");
      return {
        ok: false,
        status: 503,
        retryAfterSec: 60,
        error: "Rate limiting unavailable",
      };
    }
    console.warn("Rate limiting skipped: UPSTASH_REDIS_REST_* not configured");
    return { ok: true };
  }

  const authenticated = Boolean(userId);
  const identifier = await resolveRateLimitIdentifier(request, userId);

  try {
    const limiter = getLimiter(action, authenticated);
    const result = await limiter.limit(identifier);

    if (!result.success) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((result.reset - Date.now()) / 1000),
      );
      return {
        ok: false,
        status: 429,
        retryAfterSec,
        error: "Rate limit exceeded",
      };
    }

    return { ok: true };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    if (isProduction()) {
      return {
        ok: false,
        status: 503,
        retryAfterSec: 60,
        error: "Rate limiting unavailable",
      };
    }
    return { ok: true };
  }
}

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
