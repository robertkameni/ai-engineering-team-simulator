import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import {
  normalizeMangledReviewerDecisionText,
  parseReviewerDecisionWithMangleRecovery,
} from "@/ai/orchestration/normalize-mangled-decision-tag";
import {
  canApproveWithFullParticipation,
  listMissingPipelineRoles,
  shouldScheduleMissingRoleFirstTurn,
  shouldInviteDevOps,
} from "@/ai/orchestration/role-participation";
import { shouldTriggerSoftwareEarlyReview } from "@/ai/orchestration/software-early-review";
import { buildReviewerPreflightChecklist } from "@/ai/orchestration/reviewer-preflight";
import { summarizePriorTurns } from "@/ai/context/summarize-prior-turns";
import { compressCorrectionFeedback } from "@/ai/context/summarize-prior-turns";
import { buildCompressedDebateSummary } from "@/ai/artifacts/compress-debate-summary";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import { hasRecordedRunUsage } from "@/lib/ai/run-usage";
import {
  buildRunSummaryPayload,
  parseRunSummary,
} from "@/lib/db/run-summary";
import type { TranscriptEntry } from "@/ai/context/transcript";

describe("shouldTriggerSoftwareEarlyReview", () => {
  it("never triggers for physical templates", () => {
    const state = {
      hasHadEarlyReview: false,
      nextRole: "frontend" as const,
      returnToReviewer: false,
      isArchitectRevision: false,
      transcript: [
        { role: "pm" as const, agentName: "P", content: "x" },
        { role: "architect" as const, agentName: "A", content: "y" },
        { role: "backend" as const, agentName: "B", content: "z" },
        { role: "frontend" as const, agentName: "F", content: "w" },
      ],
    };

    assert.equal(shouldTriggerSoftwareEarlyReview(state, "physical"), false);
  });

  it("does not trigger after backend before frontend has spoken", () => {
    const state = {
      hasHadEarlyReview: false,
      nextRole: "backend" as const,
      returnToReviewer: false,
      isArchitectRevision: false,
      transcript: [
        { role: "pm" as const, agentName: "P", content: "x" },
        { role: "architect" as const, agentName: "A", content: "y" },
        { role: "backend" as const, agentName: "B", content: "z" },
      ],
    };

    assert.equal(shouldTriggerSoftwareEarlyReview(state, "software"), false);
  });

  it("triggers after frontend has spoken (nextRole still frontend)", () => {
    const state = {
      hasHadEarlyReview: false,
      nextRole: "frontend" as const,
      returnToReviewer: false,
      isArchitectRevision: false,
      transcript: [
        { role: "pm" as const, agentName: "P", content: "x" },
        { role: "architect" as const, agentName: "A", content: "y" },
        { role: "backend" as const, agentName: "B", content: "z" },
        { role: "frontend" as const, agentName: "F", content: "## Frontend Risks\n\nok" },
      ],
    };

    assert.equal(shouldTriggerSoftwareEarlyReview(state, "software"), true);
  });
});

describe("buildReviewerPreflightChecklist frontend gate", () => {
  it("does not hard-block Frontend Risks when frontend has not spoken", () => {
    const roster = createSimulationRoster("software");
    const checklist = buildReviewerPreflightChecklist(
      [
        {
          role: "pm",
          agentName: roster.pm.name,
          content: "## Scope\n\nok",
        },
        {
          role: "architect",
          agentName: roster.architect.name,
          content: "## Architecture\n\nok",
        },
      ],
      roster,
    );

    assert.ok(checklist.includes("not applicable yet"));
    assert.ok(!checklist.includes("prefer [REJECT: frontend] until complete"));
  });

  it("hard-blocks incomplete Frontend Risks only after frontend spoke", () => {
    const roster = createSimulationRoster("software");
    const checklist = buildReviewerPreflightChecklist(
      [
        {
          role: "frontend",
          agentName: roster.frontend.name,
          content: "## UI Plan\n\nButtons and forms.",
        },
      ],
      roster,
    );

    assert.ok(checklist.includes("prefer [REJECT: frontend] until complete"));
  });
});

describe("normalizeMangledReviewerDecisionText — study-group fixture", () => {
  it("recovers mangled [RE[RE[RE tags to [REJECT: role]", () => {
    const roster = createSimulationRoster("software");
    const fixture = `
## Review

Frontend Risks is missing and the UI plan is incomplete. The architect stack is unresolved.

[RE[RE[RE
`;

    const normalized = normalizeMangledReviewerDecisionText(fixture, roster);
    const parsed = parseReviewerDecisionWithMangleRecovery(normalized, roster);

    assert.equal(parsed.decision, "reject");
    assert.ok(
      parsed.rejectRole === "frontend" ||
        parsed.rejectRole === "architect" ||
        parsed.rejectRole === "backend" ||
        parsed.rejectRole === "pm" ||
        parsed.rejectRole === "devops",
    );
    assert.ok(normalized.includes(`[REJECT: ${parsed.rejectRole}]`));
    assert.ok(!normalized.includes("[RE[RE"));
  });

  it("recovers approve signal from mangled stream when prose closes gaps", () => {
    const fixture = `
All critical gaps are addressed. Ready for implementation.

[RE[RE[RE
`;
    const normalized = normalizeMangledReviewerDecisionText(fixture);
    const parsed = parseReviewerDecisionWithMangleRecovery(normalized);

    assert.equal(parsed.decision, "approve");
    assert.ok(normalized.includes("[APPROVE]"));
  });
});

describe("postApproveTruncation stays Approved", () => {
  it("stores postApproveTruncation on summary without degraded_truncated", () => {
    const summary = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 8,
      postApproveTruncation: true,
      hasTruncatedCriticalTurn: true,
      debateDurationMs: 120_000,
      artifactDurationMs: 45_000,
      totalDurationMs: 180_000,
      peakPromptTokens: 12_000,
    });

    const parsed = parseRunSummary(summary);
    assert.equal(parsed?.debateOutcome, "approved");
    assert.equal(parsed?.postApproveTruncation, true);
    assert.equal(parsed?.debateDurationMs, 120_000);
    assert.equal(parsed?.peakPromptTokens, 12_000);
  });
});

describe("role participation", () => {
  it("lists missing pipeline roles", () => {
    const transcript: TranscriptEntry[] = [
      { role: "pm", agentName: "P", content: "a" },
      { role: "architect", agentName: "A", content: "b" },
    ];
    assert.deepEqual(listMissingPipelineRoles(transcript), [
      "backend",
      "frontend",
      "devops",
    ]);
    assert.equal(canApproveWithFullParticipation(transcript), false);
  });

  it("schedules missing-role reject as first turn", () => {
    const transcript: TranscriptEntry[] = [
      { role: "pm", agentName: "P", content: "a" },
    ];
    assert.equal(shouldScheduleMissingRoleFirstTurn("frontend", transcript), true);
    assert.equal(
      shouldScheduleMissingRoleFirstTurn("pm", transcript),
      false,
    );
  });

  it("invites DevOps when frontend spoke and DevOps is silent", () => {
    const transcript: TranscriptEntry[] = [
      { role: "frontend", agentName: "F", content: "ui" },
    ];
    assert.equal(
      shouldInviteDevOps({
        transcript,
        hasUnresolvedOpsIssues: false,
        frontendHasSpoken: true,
      }),
      true,
    );
  });
});

describe("summarizePriorTurns / correction caps", () => {
  it("keeps latest turn verbatim and compresses older turns under the cap", () => {
    const roster = createSimulationRoster("software");
    const huge = "x".repeat(20_000);
    const transcript: TranscriptEntry[] = [
      { role: "architect", agentName: roster.architect.name, content: huge },
      { role: "backend", agentName: roster.backend.name, content: huge },
      {
        role: "reviewer",
        agentName: roster.reviewer.name,
        content: "Please fix backend auth.",
      },
    ];

    const summarized = summarizePriorTurns(transcript, roster, { maxChars: 8_000 });
    assert.equal(summarized.entries.length, 1);
    assert.equal(summarized.entries[0]?.content, "Please fix backend auth.");
    assert.ok((summarized.omittedSummary?.length ?? 0) < 8_000);
    assert.ok(summarized.totalChars < 12_000);
  });

  it("compresses oversized correction feedback well under 31k", () => {
    const feedback = ("Risk unresolved. Must fix auth. " + "padding ".repeat(5000)).repeat(2);
    assert.ok(feedback.length > 31_000);
    const compressed = compressCorrectionFeedback(feedback, 8_000);
    assert.ok(compressed.length <= 8_000);
    assert.ok(/must fix|unresolved|risk/i.test(compressed));
  });
});

describe("buildCompressedDebateSummary", () => {
  it("produces a bounded shared summary for artifact generators", () => {
    const roster = createSimulationRoster("software");
    const transcript: TranscriptEntry[] = [
      {
        role: "pm",
        agentName: roster.pm.name,
        content: "Scope ".repeat(2000),
      },
      {
        role: "architect",
        agentName: roster.architect.name,
        content: "Stack ".repeat(2000),
      },
    ];

    const summary = buildCompressedDebateSummary(
      "Build a study group app",
      transcript,
      roster,
      { maxChars: 4_000 },
    );

    assert.ok(summary.length <= 4_000);
    assert.ok(summary.includes("Product idea"));
    assert.ok(summary.includes(roster.pm.name));
  });
});

describe("usage fail-safe", () => {
  it("synthesizes usageMissing when model returns empty usage", () => {
    const accumulator = new RunUsageAccumulator();
    accumulator.addFromUsage(undefined, "deepseek-v4-flash");
    const totals = accumulator.getTotals();

    assert.equal(totals.usageMissing, true);
    assert.equal(hasRecordedRunUsage(totals), true);
    assert.equal(totals.totalTokens, 0);
  });

  it("tracks peakPromptTokens across deltas", () => {
    const accumulator = new RunUsageAccumulator();
    accumulator.addDelta({
      promptTokens: 1000,
      completionTokens: 50,
      totalTokens: 1050,
      estimatedCostUsd: 0.01,
    });
    accumulator.addDelta({
      promptTokens: 5000,
      completionTokens: 100,
      totalTokens: 5100,
      estimatedCostUsd: 0.02,
    });

    assert.equal(accumulator.getTotals().peakPromptTokens, 5000);
  });
});
