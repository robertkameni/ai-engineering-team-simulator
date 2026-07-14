// Phase 2A — Truncation enforcement tests
//
// TRUNCATION APPROVAL GUARD

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isUnapprovedDebateExitOutcome } from "@/ai/orchestration/reviewer-decision";

describe("truncation enforcement — DebateExitOutcome", () => {
  it("classifies degraded_truncated as unapproved", () => {
    assert.strictEqual(isUnapprovedDebateExitOutcome("degraded_truncated"), true);
  });

  it("classifies cap_reached as unapproved", () => {
    assert.strictEqual(isUnapprovedDebateExitOutcome("cap_reached"), true);
  });

  it("classifies reviewer_error as unapproved", () => {
    assert.strictEqual(isUnapprovedDebateExitOutcome("reviewer_error"), true);
  });

  it("classifies unknown_reject_fallback as unapproved", () => {
    assert.strictEqual(isUnapprovedDebateExitOutcome("unknown_reject_fallback"), true);
  });

  it("classifies approved as NOT unapproved", () => {
    assert.strictEqual(isUnapprovedDebateExitOutcome("approved"), false);
  });

  it("handles null as NOT unapproved", () => {
    assert.strictEqual(isUnapprovedDebateExitOutcome(null), false);
  });

  it("handles undefined as NOT unapproved", () => {
    assert.strictEqual(isUnapprovedDebateExitOutcome(undefined), false);
  });
});
