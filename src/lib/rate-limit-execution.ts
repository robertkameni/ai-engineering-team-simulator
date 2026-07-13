import "server-only";

import type { Ratelimit } from "@upstash/ratelimit";

import type { RateLimitResult } from "@/lib/rate-limit-config";
import {
  hasRedisConfig,
  isProduction,
  isRateLimitDisabled,
} from "@/lib/rate-limit-redis";

const RATE_LIMIT_UNAVAILABLE: Extract<RateLimitResult, { ok: false }> = {
  ok: false,
  status: 503,
  retryAfterSec: 60,
  error: "Rate limiting unavailable",
};

export type RateLimitPreflight =
  | { shouldLimit: false; result: RateLimitResult }
  | { shouldLimit: true };

export function preflightRateLimit(options: {
  missingConfigLogMessage: string;
  devSkipLogMessage: string;
}): RateLimitPreflight {
  if (isRateLimitDisabled()) {
    return { shouldLimit: false, result: { ok: true } };
  }

  if (!hasRedisConfig()) {
    if (isProduction()) {
      console.error(options.missingConfigLogMessage);
      return { shouldLimit: false, result: RATE_LIMIT_UNAVAILABLE };
    }
    console.warn(options.devSkipLogMessage);
    return { shouldLimit: false, result: { ok: true } };
  }

  return { shouldLimit: true };
}

export async function applyRateLimitCheck(
  limiter: Ratelimit,
  identifier: string,
  failureLogMessage: string,
): Promise<RateLimitResult> {
  try {
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
    console.error(failureLogMessage, error);
    if (isProduction()) {
      return RATE_LIMIT_UNAVAILABLE;
    }
    return { ok: true };
  }
}
