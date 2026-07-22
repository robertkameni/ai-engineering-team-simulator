import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatDeleteRateLimitError,
  parseRetryAfterSeconds,
} from "@/lib/rate-limit-message";

describe("rate-limit-message", () => {
  it("formats delete rate-limit copy with seconds", () => {
    assert.equal(
      formatDeleteRateLimitError(1),
      "Too many deletions, retry in 1 second.",
    );
    assert.equal(
      formatDeleteRateLimitError(45),
      "Too many deletions, retry in 45 seconds.",
    );
  });

  it("parses Retry-After header", () => {
    const response = new Response(null, {
      status: 429,
      headers: { "Retry-After": "90" },
    });
    assert.equal(parseRetryAfterSeconds(response), 90);
  });
});
