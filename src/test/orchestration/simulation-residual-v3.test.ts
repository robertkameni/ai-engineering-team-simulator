import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSimulationRoster } from "@/ai/agents/roster";
import { buildAgentMessages } from "@/ai/context/build-messages";
import {
  LATEST_TURN_HARD_CAP_CHARS,
  summarizePriorTurns,
} from "@/ai/context/summarize-prior-turns";
import {
  estimatePromptTokensFromChars,
  isPromptContextOverBudget,
  PROMPT_CONTEXT_BUDGET_TOKENS,
} from "@/ai/context/prompt-context-budget";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  createCorrectionLoopState,
  isDuplicateRejectReason,
  recordRejectCycle,
  shouldPreferCorrectionLoopApprove,
  UNPRODUCTIVE_CORRECTION_LOOP_THRESHOLD,
} from "@/ai/orchestration/correction-loop";
import {
  isWorthlessContinuation,
  sanitizeMergedContinuation,
} from "@/ai/orchestration/looks-like-truncated-agent-output";
import {
  computeTotalDurationMs,
  computeUserWaitMs,
  mergeRunSummaryTimingTelemetry,
  parseRunSummary,
  buildRunSummaryPayload,
} from "@/lib/db/run-summary";
import type { ReviewIssue } from "@/ai/orchestration/review-issue-tracker";

describe("v3 residual: userWaitMs", () => {
  it("equals debate + artifact, not artifact alone (food/subscription bug)", () => {
    const debateDurationMs = 604_751;
    const artifactDurationMs = 71_034;

    const userWaitMs = computeUserWaitMs({
      debateDurationMs,
      artifactDurationMs,
    });
    const totalDurationMs = computeTotalDurationMs({
      debateDurationMs,
      artifactDurationMs,
    });

    assert.equal(userWaitMs, 675_785);
    assert.equal(totalDurationMs, 675_785);
    assert.ok((userWaitMs ?? 0) > artifactDurationMs);
    assert.ok((userWaitMs ?? 0) >= debateDurationMs + artifactDurationMs - 1);
  });

  it("merge after synthesis stores corrected userWaitMs", () => {
    const provisional = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 8,
      debateDurationMs: 604_751,
      artifactDurationMs: null,
      userWaitMs: null,
      totalDurationMs: 604_751,
      artifactsPending: true,
    });

    const merged = mergeRunSummaryTimingTelemetry(provisional, {
      artifactDurationMs: 71_034,
      userWaitMs: computeUserWaitMs({
        debateDurationMs: 604_751,
        artifactDurationMs: 71_034,
      }),
      totalDurationMs: computeTotalDurationMs({
        debateDurationMs: 604_751,
        artifactDurationMs: 71_034,
      }),
      artifactsPending: false,
    });

    const parsed = parseRunSummary(merged);
    assert.equal(parsed?.userWaitMs, 675_785);
    assert.notEqual(parsed?.userWaitMs, 71_034);
  });
});

describe("v3 residual: context bloat (420k peak)", () => {
  it("caps the latest turn so oversized architect dumps cannot blow the budget", () => {
    const roster = createSimulationRoster("software");
    const huge = "x".repeat(42_000);
    const transcript: TranscriptEntry[] = [
      { role: "pm", agentName: "A", content: "scope" },
      { role: "architect", agentName: "B", content: huge },
    ];

    const summarized = summarizePriorTurns(transcript, roster);
    assert.ok(summarized.entries[0]!.content.length <= LATEST_TURN_HARD_CAP_CHARS + 1);
    assert.ok(summarized.totalChars < 20_000);
  });

  it("keeps assembled correction-loop prompts under the token budget", () => {
    const roster = createSimulationRoster("software");
    const huge = "Architecture dump. ".repeat(2_500);
    const transcript: TranscriptEntry[] = [];
    for (let i = 0; i < 8; i += 1) {
      transcript.push({
        role: i % 2 === 0 ? "architect" : "reviewer",
        agentName: i % 2 === 0 ? "Taylor" : "Skyler",
        content: huge,
      });
    }

    const messages = buildAgentMessages(
      "architect",
      "subscription analytics dashboard for indie SaaS founders",
      transcript,
      roster,
      {
        correction: {
          reviewerName: "Skyler",
          feedback: "missing outbox atomicity",
          targetRole: "architect",
        },
      },
    );

    const totalChars = messages.reduce((sum, message) => {
      return (
        sum + (typeof message.content === "string" ? message.content.length : 0)
      );
    }, 0);
    const estimatedTokens = estimatePromptTokensFromChars(totalChars);

    assert.ok(
      estimatedTokens < PROMPT_CONTEXT_BUDGET_TOKENS,
      `expected < ${PROMPT_CONTEXT_BUDGET_TOKENS} tokens, got ${estimatedTokens}`,
    );
    assert.equal(
      isPromptContextOverBudget({ promptTokens: estimatedTokens }),
      false,
    );
  });
});

describe("v3 residual: meta-spam guard", () => {
  it("treats food-style 'I have no continuation needed…' as worthless", () => {
    const foodMeta =
      "I have no continuation needed — my prior message ended on a complete sentence with all sections fully closed. The output was not truncated; it reached its natural conclusion. No further text is required.";

    assert.equal(isWorthlessContinuation(foodMeta), true);
    assert.equal(
      sanitizeMergedContinuation(`${foodMeta}\n\n[APPROVE]`).includes(
        "continuation needed",
      ),
      false,
    );
  });
});

describe("v3 residual: correction loop detection", () => {
  it("detects ping-pong duplicate rejects and prefers approve", () => {
    const issues: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "architect",
        keywords: ["outbox", "atomicity", "webhook", "stripe"],
        excerpt: "missing outbox atomicity for stripe webhooks",
        status: "still_open",
        severity: "blocker",
        createdOnCycle: 0,
        lastAttemptedOnTurn: 4,
        lastConfirmedOnTurn: 6,
      },
    ];

    assert.equal(
      isDuplicateRejectReason({
        rejectRole: "architect",
        feedbackText:
          "UNRESOLVED: outbox atomicity still missing for stripe webhook inserts",
        reviewIssues: issues,
      }),
      true,
    );

    let loop = createCorrectionLoopState();

    for (let i = 0; i < UNPRODUCTIVE_CORRECTION_LOOP_THRESHOLD; i += 1) {
      loop = recordRejectCycle(loop, {
        rejectRole: "architect",
        feedbackText:
          "UNRESOLVED: outbox atomicity still missing for stripe webhook inserts",
        reviewIssues: issues,
        newIssueCount: 0,
      });
    }

    assert.equal(loop.correctionLoopDetected, true);
    assert.equal(
      shouldPreferCorrectionLoopApprove({
        transcript: [
          { role: "pm", agentName: "a", content: "x" },
          { role: "architect", agentName: "b", content: "x" },
          { role: "backend", agentName: "c", content: "x" },
          { role: "frontend", agentName: "d", content: "x" },
          { role: "devops", agentName: "e", content: "x" },
        ],
        correctionLoopDetected: true,
        unresolvedOpsIssueCount: 0,
      }),
      true,
    );
  });
});
