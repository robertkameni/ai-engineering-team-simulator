import "server-only";

import { Ratelimit } from "@upstash/ratelimit";

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
import {
  applyRateLimitCheck,
  preflightRateLimit,
} from "@/lib/rate-limit-execution";
import { getRedis } from "@/lib/rate-limit-redis";

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
  const preflight = preflightRateLimit({
    missingConfigLogMessage: "Auth rate limiting unavailable: missing Upstash Redis env",
    devSkipLogMessage: "Auth rate limiting skipped: UPSTASH_REDIS_REST_* not configured",
  });
  if (!preflight.shouldLimit) {
    return preflight.result;
  }

  const ip = getClientIpFromHeaders(request.headers);
  const identifier = resolveAuthRateLimitKey(action, ip, email);
  const limiter = getAuthLimiter(action);

  return applyRateLimitCheck(
    limiter,
    identifier,
    "Auth rate limit check failed:",
  );
}
