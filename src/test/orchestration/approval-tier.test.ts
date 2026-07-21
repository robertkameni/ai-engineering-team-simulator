import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeApprovalTier,
  debateOutcomeForApprovalTier,
  resolveApprovedDebateOutcome,
} from "@/ai/orchestration/approval-tier";

describe("approval tier differentiation", () => {
  it("maps a clean run to approved / clean", () => {
    const resolved = resolveApprovedDebateOutcome({
      acceptedCriticalRiskCount: 0,
      postApproveTruncation: false,
      rejectCount: 1,
    });

    assert.equal(resolved.approvalTier, "clean");
    assert.equal(resolved.debateOutcome, "approved");
    assert.equal(debateOutcomeForApprovalTier("clean"), "approved");
  });

  it("maps three accepted risks to approved_forced_close", () => {
    const resolved = resolveApprovedDebateOutcome({
      acceptedCriticalRiskCount: 3,
      postApproveTruncation: false,
      rejectCount: 1,
    });

    assert.equal(resolved.approvalTier, "forced_close");
    assert.equal(resolved.debateOutcome, "approved_forced_close");
    assert.equal(computeApprovalTier({
      acceptedCriticalRiskCount: 3,
      postApproveTruncation: false,
      rejectCount: 0,
    }), "forced_close");
  });

  it("maps postApproveTruncation to forced_close", () => {
    const resolved = resolveApprovedDebateOutcome({
      acceptedCriticalRiskCount: 0,
      postApproveTruncation: true,
      rejectCount: 0,
    });

    assert.equal(resolved.approvalTier, "forced_close");
    assert.equal(resolved.debateOutcome, "approved_forced_close");
  });

  it("maps one accepted risk without truncation to accepted_risks", () => {
    const resolved = resolveApprovedDebateOutcome({
      acceptedCriticalRiskCount: 2,
      postApproveTruncation: false,
      rejectCount: 1,
    });

    assert.equal(resolved.approvalTier, "accepted_risks");
    assert.equal(resolved.debateOutcome, "approved_with_accepted_risks");
  });
});
