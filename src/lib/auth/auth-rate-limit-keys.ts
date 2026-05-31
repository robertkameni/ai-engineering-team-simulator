import { createHash } from "node:crypto";

import type { AuthRateLimitAction } from "@/lib/rate-limit-config";

export function hashAuthEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export function resolveAuthRateLimitKey(
  action: AuthRateLimitAction,
  ip: string,
  email: string,
): string {
  const emailHash = hashAuthEmail(email);
  const ipSegment = ip !== "unknown" ? ip : "unknown-ip";
  return `${action}:ip:${ipSegment}:email:${emailHash}`;
}
