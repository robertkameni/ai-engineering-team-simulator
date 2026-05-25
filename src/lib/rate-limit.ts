import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitAction = "simulate" | "delete";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; status: 429 | 503; retryAfterSec: number; error: string };

function parseLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isRateLimitDisabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === "true";
}

function hasRedisConfig(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
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

  const limits: Record<RateLimitAction, { guest: number; auth: number }> = {
    simulate: {
      guest: parseLimit("RATE_LIMIT_SIMULATE_GUEST", 3),
      auth: parseLimit("RATE_LIMIT_SIMULATE_AUTH", 10),
    },
    delete: {
      guest: parseLimit("RATE_LIMIT_DELETE", 30),
      auth: parseLimit("RATE_LIMIT_DELETE", 30),
    },
  };

  const limit = authenticated ? limits[action].auth : limits[action].guest;
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
  const identifier =
    authenticated && userId ? `user:${userId}` : `ip:${getClientIp(request)}`;

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
