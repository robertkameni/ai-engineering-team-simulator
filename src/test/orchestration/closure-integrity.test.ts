import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import {
  extractReviewOpenGaps,
} from "@/ai/artifacts/build-review-open-gaps";
import { needsUnapprovedDebateNotice } from "@/ai/artifacts/generate-artifact-document";
import {
  isFrontendDeliverableInsufficient,
} from "@/ai/orchestration/agent-deliverable-quality";
import { normalizeAgentPersistedText } from "@/ai/orchestration/agent-stream-text";
import {
  buildTruncationContinuationPrompt,
  hasDuplicatedTrailingContent,
  hasFrontendRisksSection,
  hasGluedMarkdownHeading,
  mergeContinuationText,
  looksLikeTruncatedAgentOutput,
} from "@/ai/orchestration/looks-like-truncated-agent-output";
import { shouldRecoverApproveFromExcerpt } from "@/ai/orchestration/recover-reviewer-decision-tag";

describe("hasFrontendRisksSection", () => {
  it("accepts English Frontend Risks heading", () => {
    assert.equal(hasFrontendRisksSection("## Frontend Risks\n\nCLS mitigated."), true);
  });

  it("accepts translated and alias headings that keep Frontend Risks meaning", () => {
    assert.equal(hasFrontendRisksSection("## Risques frontend\n\nDone."), true);
    assert.equal(hasFrontendRisksSection("## Client Risks\n\nDone."), true);
    assert.equal(hasFrontendRisksSection("## FE Risks\n\nDone."), true);
    assert.equal(hasFrontendRisksSection("## Frontend Readiness\n\nReady."), true);
  });
});

describe("looksLikeTruncatedAgentOutput — closure integrity", () => {
  it("does not flag complete frontend output that ends with Frontend Risks", () => {
    const text = `## UI & Routing

App Router with server components for the dashboard.

## Key Flows & UX

Onboarding wizard lands users on the first meaningful screen under 90 seconds.

## State Management

SWR with 30-second stale time and coalesced 401 refresh.

## Component Architecture

**Component 1: Wizard** — Client Component with step state.

## Frontend Risks

CLS is mitigated with reserved skeleton heights. Race conditions use request ids. Hydration mismatches are avoided by client-only QR scanning. Accessibility gaps use text labels beside color badges.

## Frontend Readiness

All components above are specified and ready to implement.`;

    assert.equal(looksLikeTruncatedAgentOutput(text, "frontend"), false);
  });

  it("does not require Frontend Risks for physical frontend (planning/budget) turns", () => {
    const text = `## Work Phasing

Week 1 site prep, week 2 foundation pour, week 3 framing.

## Budget Scenarios

Minimal, median, and urgent envelopes with contingency.

## Operational Risks

Weather delay buffer and contractor no-show contingency are documented.`;

    assert.equal(
      looksLikeTruncatedAgentOutput(text, "frontend", { templateId: "physical" }),
      false,
    );
  });

  it("flags glued markdown headings as truncated", () => {
    const text =
      "## Architecture\n\nMonolith deployed on Vercel.### Day-2 Operations\n\nBackups run nightly.";
    assert.equal(hasGluedMarkdownHeading(text), true);
    assert.equal(looksLikeTruncatedAgentOutput(text, "architect"), true);
  });

  it("flags duplicated trailing content as truncated", () => {
    const paragraph =
      "The dashboard station list uses aria-live polite to announce changes when bike counts update via polling.";
    const text = `## Frontend Risks\n\n${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    assert.equal(hasDuplicatedTrailingContent(text), true);
    assert.equal(looksLikeTruncatedAgentOutput(text, "frontend"), true);
  });

  it("does not flag a completed continued section as truncated forever", () => {
    const text = `## Architecture

Initial topology is a modular monolith.

## Data Model (continued)

Trip and Day entities are complete with indexes. Soft-delete is supported on Trip.`;

    assert.equal(looksLikeTruncatedAgentOutput(text, "architect"), false);
  });
});

describe("mergeContinuationText", () => {
  it("inserts a paragraph break and strips overlapping re-paste", () => {
    const prior = "## Risks\n\nFirst risk is pool exhaustion. Second risk is Redis failover.";
    const continuation =
      "Second risk is Redis failover. Third risk is AI latency with AbortController timeouts.";
    const merged = mergeContinuationText(prior, continuation);
    assert.match(merged, /First risk is pool exhaustion/);
    assert.match(merged, /Third risk is AI latency/);
    assert.equal(
      (merged.match(/Second risk is Redis failover/g) ?? []).length,
      1,
    );
  });

  it("collapses a full-plan re-post continuation into one copy of each section", () => {
    const prior = [
      "## Summary",
      "A normalized outbox with a single transaction.",
      "",
      "## Decisions",
      "- **Decision:** idempotent eventId unique index.",
      "- **Decision:** keyset pagination on events.",
      "",
      "## Backend Risks",
      "- **Risk:** Outbox poller lag under high volume.",
    ].join("\n");
    const repost = [
      "## Backend Risks",
      "- **Risk:** Outbox poller lag under high volume. Mitigation: batch size 100, poll 500ms.",
      "- **Risk:** KMS key rotation breaks decryption. Mitigation: monthly rotation drill.",
      "",
      "## Summary",
      "Compressed re-emission of the normalized outbox.",
      "",
      "## Decisions",
      "- Decision: idempotent eventId unique index.",
      "",
      "## Jobs & Tests",
      "Compressed tail section the prior never reached.",
    ].join("\n");

    const merged = mergeContinuationText(prior, repost);

    assert.equal((merged.match(/^## Summary$/gm) ?? []).length, 1);
    assert.equal((merged.match(/^## Decisions$/gm) ?? []).length, 1);
    assert.equal((merged.match(/^## Backend Risks$/gm) ?? []).length, 1);
    assert.match(merged, /A normalized outbox with a single transaction/);
    assert.match(merged, /## Jobs & Tests/);
    assert.match(merged, /Compressed tail section the prior never reached/);
  });

  it("takes the continuation's complete version of a section the prior truncated", () => {
    const prior = [
      "## Summary",
      "A normalized outbox with a single transaction.",
      "",
      "## Backend Risks",
      "- **Risk:** Outbox poller lag under high vol",
    ].join("\n");
    const repost = [
      "## Backend Risks",
      "- **Risk:** Outbox poller lag under high volume. Mitigation: batch size 100.",
      "",
      "## Summary",
      "Compressed re-emission of the normalized outbox.",
    ].join("\n");

    const merged = mergeContinuationText(prior, repost);

    assert.equal((merged.match(/^## Summary$/gm) ?? []).length, 1);
    assert.equal((merged.match(/^## Backend Risks$/gm) ?? []).length, 1);
    assert.match(merged, /A normalized outbox with a single transaction/);
    assert.match(merged, /Mitigation: batch size 100/);
  });

  it("keeps a non-repost continuation with repeated headings untouched", () => {
    const prior = "## Summary\nCore write path.";
    const continuation =
      "## Backend Risks\nPool exhaustion under load.";
    const merged = mergeContinuationText(prior, continuation);
    assert.match(merged, /## Summary/);
    assert.match(merged, /## Backend Risks/);
    assert.match(merged, /Pool exhaustion under load/);
  });
});

describe("buildTruncationContinuationPrompt", () => {
  it("is role-aware and forbids re-paste", () => {
    const frontendPrompt = buildTruncationContinuationPrompt(
      "## Component Architecture\n\nCut off at",
      "frontend",
    );
    assert.match(frontendPrompt, /Frontend Risks/);
    assert.match(frontendPrompt, /do not repeat/i);
    assert.match(frontendPrompt, /Frontend Readiness/);

    const backendPrompt = buildTruncationContinuationPrompt(
      "## Backend Risks\n\nCut off at",
      "backend",
    );
    assert.match(backendPrompt, /Backend Risks/);
    assert.doesNotMatch(backendPrompt, /complete ## Frontend Risks/);
  });
});

describe("isFrontendDeliverableInsufficient — template awareness", () => {
  it("skips software Frontend Risks gate for physical template", () => {
    const text = `## Work Phasing

Phase one clears the site and sets temporary fencing.

## Budget Scenarios

Minimal and median budgets with a 10 percent contingency.

## Operational Risks

Weather and contractor delays are mitigated with float days.`;

    assert.equal(isFrontendDeliverableInsufficient(text, "physical"), false);
    assert.equal(isFrontendDeliverableInsufficient(text, "software"), true);
  });

  it("requires Frontend Risks for software template", () => {
    const text = `## UI & Routing

Routes and layouts.

## Key Flows & UX

Onboarding flow.

## State Management

Cache rules.

## Component Architecture

Three components named and specified with props.`;

    assert.equal(isFrontendDeliverableInsufficient(text, "software"), true);
  });
});

describe("normalizeAgentPersistedText — glued headings", () => {
  it("splits glued markdown headings", () => {
    const normalized = normalizeAgentPersistedText(
      "architect",
      "Done.### Day-2 Operations\n\nBackups are nightly.",
    );
    assert.match(normalized, /Done\.\n\n### Day-2 Operations/);
  });
});

describe("extractReviewOpenGaps — last-reviewer authority", () => {
  const roster = createSimulationRoster("software");

  it("ignores historical Disagree gaps after a later [APPROVE]", () => {
    const gaps = extractReviewOpenGaps(
      [
        {
          role: "reviewer",
          agentName: "Blake",
          content:
            "**Disagree**. BEGIN IMMEDIATE for all reads is unresolved. [REJECT: backend]",
        },
        {
          role: "backend",
          agentName: "Casey",
          content: "Switched reads to BEGIN DEFERRED.",
        },
        {
          role: "reviewer",
          agentName: "Blake",
          content:
            "**Agree**. BEGIN DEFERRED is now in Casey's plan. All prior objections are addressed.\n\n[APPROVE]",
        },
      ],
      roster,
    );

    assert.equal(gaps.length, 0);
  });

  it("keeps UNRESOLVED markers from the final reject review", () => {
    const gaps = extractReviewOpenGaps(
      [
        {
          role: "reviewer",
          agentName: "Blake",
          content:
            "**1. Restore endpoint (UNRESOLVED)**\nNo tested restore path exists.\n\n[REJECT: devops]",
        },
      ],
      roster,
    );

    assert.equal(gaps.length, 1);
    assert.match(gaps[0]!.excerpt, /UNRESOLVED/);
  });
});

describe("needsUnapprovedDebateNotice", () => {
  it("includes degraded_truncated and other unapproved outcomes", () => {
    assert.equal(needsUnapprovedDebateNotice("degraded_truncated"), true);
    assert.equal(needsUnapprovedDebateNotice("reviewer_error"), true);
    assert.equal(needsUnapprovedDebateNotice("insufficient_budget"), true);
    assert.equal(needsUnapprovedDebateNotice("cap_reached"), true);
    assert.equal(needsUnapprovedDebateNotice("approved"), false);
  });
});

describe("shouldRecoverApproveFromExcerpt", () => {
  it("refuses approve recovery when UNRESOLVED markers remain", () => {
    assert.equal(
      shouldRecoverApproveFromExcerpt(
        "Risk remains UNRESOLVED. Softly looks complete overall.",
      ),
      false,
    );
  });

  it("allows approve recovery when excerpt clearly closes without open gaps", () => {
    assert.equal(
      shouldRecoverApproveFromExcerpt(
        "All critical risks have mitigations in prior teammate messages. No unresolved gaps remain.",
      ),
      true,
    );
  });
});
