import "server-only";

import { Redis } from "@upstash/redis";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isRateLimitDisabled(): boolean {
  if (process.env.RATE_LIMIT_DISABLED === "true") return true;
  if (
    process.env.NODE_ENV === "development" &&
    process.env.RATE_LIMIT_ENABLED_IN_DEV !== "true"
  ) {
    return true;
  }
  return false;
}

export function hasRedisConfig(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (!hasRedisConfig()) return null;
  if (!redisClient) {
    redisClient = Redis.fromEnv();
  }
  return redisClient;
}
