import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import {
  applyDeepFocusEnforcement,
  evaluateDeepFocusTurn,
  mergeDeepFocusTagContinuation,
  rewriteApproveToReject,
  stampDeepFocusFallback,
} from "@/ai/orchestration/deep-focus-gate";

const roster = createSimulationRoster("software");

const pmSpoke = [
  {
    role: "pm" as const,
    agentName: roster.pm.name,
    content: "## Scope\n\nField inspections.",
  },
];

describe("evaluateDeepFocusTurn", () => {
  it("does not require a challenge on the PM first turn", () => {
    const evaluation = evaluateDeepFocusTurn({
      role: "pm",
      text: "## Scope\n\nInspection checklists and PDF reports.",
      transcript: [],
      roster,
    });

    assert.deepEqual(evaluation.violations, []);
  });

  it("requires a challenge after a prior pipeline turn", () => {
    const evaluation = evaluateDeepFocusTurn({
      role: "architect",
      text: "## Decisions\n\nThree-tier Next.js and Postgres.",
      transcript: pmSpoke,
      roster,
    });

    assert.ok(evaluation.violations.includes("missing_challenge"));
  });

  it("accepts a challenge tag that uses the teammate display name", () => {
    const evaluation = evaluateDeepFocusTurn({
      role: "architect",
      text: `Sage left PDF hosting unspecified. [CHALLENGE: ${roster.pm.name}]`,
      transcript: pmSpoke,
      roster,
    });

    assert.equal(evaluation.violations.includes("missing_challenge"), false);
  });

  it("does not treat a reviewer describing a tested restore gap as an unverified claim", () => {
    const evaluation = evaluateDeepFocusTurn({
      role: "reviewer",
      text: `Alex mentions backup but no tested restore procedure. [APPROVE]`,
      transcript: pmSpoke,
      roster,
    });

    assert.equal(evaluation.violations.includes("unverified_claim"), false);
  });

  it("accepts a challenge tag targeting a teammate who already spoke", () => {
    const evaluation = evaluateDeepFocusTurn({
      role: "architect",
      text: "Sage left PDF hosting unspecified. [CHALLENGE: pm]",
      transcript: pmSpoke,
      roster,
    });

    assert.equal(evaluation.violations.includes("missing_challenge"), false);
  });

  it("skips the challenge requirement on a correction turn", () => {
    const evaluation = evaluateDeepFocusTurn({
      role: "backend",
      text: "## Changes\n\nSplit PDF and photo queues.",
      transcript: pmSpoke,
      roster,
      isCorrection: true,
    });

    assert.equal(evaluation.violations.includes("missing_challenge"), false);
  });

  it("flags an unverified restore-tested claim without evidence or blocked", () => {
    const evaluation = evaluateDeepFocusTurn({
      role: "devops",
      text: "Nightly backup. Restore tested monthly. [CHALLENGE: pm]",
      transcript: pmSpoke,
      roster,
    });

    assert.ok(evaluation.violations.includes("unverified_claim"));
  });

  it("accepts an evidence tag for a tested restore claim", () => {
    const evaluation = evaluateDeepFocusTurn({
      role: "devops",
      text: "Restore tested monthly. [CHALLENGE: pm] [EVIDENCE: restore-drill.yml]",
      transcript: pmSpoke,
      roster,
    });

    assert.equal(evaluation.violations.includes("unverified_claim"), false);
  });
});

describe("applyDeepFocusEnforcement", () => {
  it("rewrites reviewer approve when the review still has an open data-loss gap", () => {
    const review = `## Review of Team Plans

**Disagree — ${roster.devops.name}'s restore drill:** Without a named job this is an open data-loss gap.

## Critical Risks

1. **Security — token refresh:** ${roster.frontend.name} mentions auth, but no interceptor mechanism is specified.

[APPROVE]`;

    const result = applyDeepFocusEnforcement({
      role: "reviewer",
      text: review,
      transcript: pmSpoke,
      roster,
    });

    assert.ok(
      result.evaluation.violations.includes("approve_with_unresolved_critical"),
    );
    assert.match(result.decisionText, /\[REJECT: /);
    assert.equal(result.decisionText.includes("[APPROVE]"), false);
  });

  it("rewrites reviewer approve when the review contains a blocked tag", () => {
    const result = applyDeepFocusEnforcement({
      role: "reviewer",
      text: "Backup restore is still open.\n\n[BLOCKED: backup-drill]\n\n[APPROVE]",
      transcript: pmSpoke,
      roster,
    });

    assert.ok(result.evaluation.violations.includes("approve_with_blocked"));
    assert.equal(result.evaluation.rejectRole, "devops");
    assert.equal(
      result.decisionText.includes("[REJECT: devops]"),
      true,
    );
  });
});

describe("stampDeepFocusFallback", () => {
  it("stamps blocked tags when challenge or evidence is still missing", () => {
    const stamped = stampDeepFocusFallback(
      "## Decisions\n\nThree-tier topology.",
      ["missing_challenge", "unverified_claim"],
    );

    assert.match(stamped, /\[BLOCKED: missing-challenge\]/);
    assert.match(stamped, /\[BLOCKED: unverified-claim\]/);
  });

  it("does not stamp when the draft already has the required tags", () => {
    const stamped = stampDeepFocusFallback(
      "Split queues. [CHALLENGE: architect] [EVIDENCE: restore-drill.yml]",
      ["missing_challenge", "unverified_claim"],
    );

    assert.equal(stamped.includes("[BLOCKED:"), false);
  });
});

describe("mergeDeepFocusTagContinuation", () => {
  it("appends only new tags and drops a full plan rewrite", () => {
    const base = "## Summary\n\nThree-tier topology.\n\n## Decisions\n\nOutbox.";
    const continuation = `${base}\n\n## Summary\n\nThree-tier topology again.\n\n[CHALLENGE: ${roster.pm.name}]`;

    const merged = mergeDeepFocusTagContinuation(base, continuation, roster);

    assert.equal(merged.includes("Three-tier topology again"), false);
    assert.match(merged, /\[CHALLENGE: pm\]/);
    assert.equal((merged.match(/## Summary/g) ?? []).length, 1);
  });
});

describe("rewriteApproveToReject", () => {
  it("replaces the last approve tag", () => {
    assert.equal(
      rewriteApproveToReject("Looks good.\n\n[APPROVE]", "devops"),
      "Looks good.\n\n[REJECT: devops]",
    );
  });
});
