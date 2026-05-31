import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hashAuthEmail,
  resolveAuthRateLimitKey,
} from "../../lib/auth/auth-rate-limit-keys.js";
import {
  getAuthRateLimitThreshold,
  type RateLimitResult,
} from "../../lib/rate-limit-config.js";

function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
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

describe("auth rate limit configuration", () => {
  it("uses 10 attempts per window for login and register", () => {
    assert.equal(getAuthRateLimitThreshold("auth_login"), 10);
    assert.equal(getAuthRateLimitThreshold("auth_register"), 10);
  });
});

describe("resolveAuthRateLimitKey", () => {
  it("is stable for the same email and IP", () => {
    const a = resolveAuthRateLimitKey(
      "auth_login",
      "203.0.113.10",
      "User@Example.com",
    );
    const b = resolveAuthRateLimitKey(
      "auth_login",
      "203.0.113.10",
      "user@example.com",
    );
    assert.equal(a, b);
  });

  it("differs when email or IP changes", () => {
    const base = resolveAuthRateLimitKey(
      "auth_login",
      "203.0.113.10",
      "alice@example.com",
    );
    const otherEmail = resolveAuthRateLimitKey(
      "auth_login",
      "203.0.113.10",
      "bob@example.com",
    );
    const otherIp = resolveAuthRateLimitKey(
      "auth_login",
      "198.51.100.4",
      "alice@example.com",
    );
    assert.notEqual(base, otherEmail);
    assert.notEqual(base, otherIp);
  });

  it("hashes emails without exposing raw addresses in the key", () => {
    const key = resolveAuthRateLimitKey(
      "auth_register",
      "203.0.113.10",
      "secret@example.com",
    );
    assert.ok(!key.includes("secret@example.com"));
    assert.equal(
      hashAuthEmail("secret@example.com"),
      hashAuthEmail("SECRET@example.com"),
    );
  });
});

describe("auth rate limit HTTP responses", () => {
  it("maps exceeded limits to 429 with Retry-After", async () => {
    const response = rateLimitResponse({
      ok: false,
      status: 429,
      retryAfterSec: 120,
      error: "Rate limit exceeded",
    });

    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "120");
    const body = (await response.json()) as { error: string; retryAfter: number };
    assert.equal(body.error, "Rate limit exceeded");
    assert.equal(body.retryAfter, 120);
  });
});
