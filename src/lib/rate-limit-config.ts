export type RateLimitAction = "simulate" | "delete" | "export_pdf" | "regenerate";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; status: 429 | 503; retryAfterSec: number; error: string };

export const DEFAULT_RATE_LIMITS: Record<
  RateLimitAction,
  { guest: number; auth: number }
> = {
  simulate: { guest: 3, auth: 30 },
  delete: { guest: 30, auth: 30 },
  export_pdf: { guest: 5, auth: 5 },
  regenerate: { guest: 3, auth: 10 },
};

const LIMIT_ENV_KEYS: Record<
  RateLimitAction,
  { guest: string; auth: string }
> = {
  simulate: {
    guest: "RATE_LIMIT_SIMULATE_GUEST",
    auth: "RATE_LIMIT_SIMULATE_AUTH",
  },
  delete: {
    guest: "RATE_LIMIT_DELETE",
    auth: "RATE_LIMIT_DELETE",
  },
  export_pdf: {
    guest: "RATE_LIMIT_EXPORT_PDF",
    auth: "RATE_LIMIT_EXPORT_PDF",
  },
  regenerate: {
    guest: "RATE_LIMIT_REGENERATE_GUEST",
    auth: "RATE_LIMIT_REGENERATE_AUTH",
  },
};

function parseLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getRateLimitThreshold(
  action: RateLimitAction,
  authenticated: boolean,
): number {
  const defaults = DEFAULT_RATE_LIMITS[action];
  const envKeys = LIMIT_ENV_KEYS[action];
  const limit = authenticated ? defaults.auth : defaults.guest;
  const envKey = authenticated ? envKeys.auth : envKeys.guest;
  return parseLimit(envKey, limit);
}
