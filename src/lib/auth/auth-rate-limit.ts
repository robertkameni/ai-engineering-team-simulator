import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import {
  resolveAuthRateLimitKey,
} from "@/lib/auth/auth-rate-limit-keys";
import {
  AUTH_RATE_LIMIT_WINDOW,
  getAuthRateLimitThreshold,
  type AuthRateLimitAction,
  type RateLimitResult,
} from "@/lib/rate-limit-config";
import { getClientIpFromHeaders } from "@/lib/rate-limit";

export { hashAuthEmail, resolveAuthRateLimitKey } from "@/lib/auth/auth-rate-limit-keys";

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

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!hasRedisConfig()) return null;
  if (!redisClient) {
    redisClient = Redis.fromEnv();
  }
  return redisClient;
}

const authLimiterCache = new Map<AuthRateLimitAction, Ratelimit>();

function getAuthLimiter(action: AuthRateLimitAction): Ratelimit {
  const redis = getRedis();
  if (!redis) {
    throw new Error("Redis client unavailable");
  }

  const existing = authLimiterCache.get(action);
  if (existing) return existing;

  const limit = getAuthRateLimitThreshold(action);
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, AUTH_RATE_LIMIT_WINDOW),
    prefix: `team-sim:${action}`,
    analytics: false,
  });

  authLimiterCache.set(action, limiter);
  return limiter;
}

export async function assertAuthRateLimit(
  request: Request,
  action: AuthRateLimitAction,
  email: string,
): Promise<RateLimitResult> {
  if (isRateLimitDisabled()) {
    return { ok: true };
  }

  if (!hasRedisConfig()) {
    if (isProduction()) {
      console.error("Auth rate limiting unavailable: missing Upstash Redis env");
      return {
        ok: false,
        status: 503,
        retryAfterSec: 60,
        error: "Rate limiting unavailable",
      };
    }
    console.warn("Auth rate limiting skipped: UPSTASH_REDIS_REST_* not configured");
    return { ok: true };
  }

  const ip = getClientIpFromHeaders(request.headers);
  const identifier = resolveAuthRateLimitKey(action, ip, email);

  try {
    const limiter = getAuthLimiter(action);
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
    console.error("Auth rate limit check failed:", error);
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
