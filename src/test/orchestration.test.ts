import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasPhysicalKeywords,
  hasSoftwareKeywords,
  isKeywordHybridProject,
} from "../ai/orchestration/classify-project.js";
import {
  extractReviewerDecisionTag,
  isDebateComplete,
  isLegacyUntaggedReviewerCompletion,
  parseDebateOutcomeFromRunSummary,
  parseReviewerDecision,
  resolveUnknownReviewerDecision,
  reviewerVisibleText,
  stripReviewerDecisionTag,
} from "../ai/orchestration/reviewer-decision.js";

describe("parseReviewerDecision", () => {
  it("parses strict terminal [APPROVE]", () => {
    const raw = "## Review\n\nLooks good.\n\n[APPROVE]";
    const parsed = parseReviewerDecision(raw);
    assert.equal(parsed.decision, "approve");
    assert.ok(!parsed.displayText.includes("[APPROVE]"));
  });

  it("parses [APPROVE] with trailing whitespace", () => {
    const parsed = parseReviewerDecision("## Review\n\n[APPROVE]   \n  ");
    assert.equal(parsed.decision, "approve");
  });

  it("parses [APPROVE] with a short conversational suffix", () => {
    const parsed = parseReviewerDecision("## Review\n\n[APPROVE] — thanks.");
    assert.equal(parsed.decision, "approve");
  });

  it("parses valid [REJECT: pm] at the end", () => {
    const parsed = parseReviewerDecision("## Review\n\nScope gap.\n\n[REJECT: pm]");
    assert.equal(parsed.decision, "reject");
    assert.equal(parsed.rejectRole, "pm");
  });

  it("returns unknown for [REJECT: reviewer]", () => {
    const parsed = parseReviewerDecision("## Review\n\n[REJECT: reviewer]");
    assert.equal(parsed.decision, "unknown");
    assert.equal(parsed.rejectRole, undefined);
  });

  it("returns unknown for inline [APPROVE] in the body", () => {
    const padding = "a".repeat(500);
    const afterTag = "b".repeat(80);
    const raw = `${padding} Early mention [APPROVE] ${afterTag}`;
    const parsed = parseReviewerDecision(raw);
    assert.equal(parsed.decision, "unknown");
  });

  it("returns unknown when tail after tag exceeds 60 characters", () => {
    const tail = "x".repeat(61);
    const parsed = parseReviewerDecision(`## Review\n\n[APPROVE]${tail}`);
    assert.equal(parsed.decision, "unknown");
  });
});

describe("extractReviewerDecisionTag / stripReviewerDecisionTag", () => {
  it("extracts the rightmost valid tag in the terminal region", () => {
    const tag = extractReviewerDecisionTag("## A\n\n[REJECT: architect]");
    assert.ok(tag);
    assert.equal(tag.kind, "reject");
  });

  it("stripReviewerDecisionTag removes tag and tail", () => {
    const stripped = stripReviewerDecisionTag("## Review\n\n[APPROVE] — ok.");
    assert.equal(stripped, "## Review");
  });
});

describe("reviewerVisibleText", () => {
  it("hides a complete approve tag", () => {
    const visible = reviewerVisibleText("## Review\n\n[APPROVE]");
    assert.equal(visible, "## Review");
  });

  it("hides a partial streaming reject tag", () => {
    const visible = reviewerVisibleText("## Review\n\n[REJECT:");
    assert.equal(visible, "## Review");
  });
});

describe("resolveUnknownReviewerDecision", () => {
  it("defaults to reject pm", () => {
    const resolved = resolveUnknownReviewerDecision();
    assert.equal(resolved.decision, "reject");
    assert.equal(resolved.rejectRole, "pm");
  });
});

describe("isDebateComplete", () => {
  const reviewerApprove = [
    { agentRole: "reviewer", content: "## Review\n\n[APPROVE]" },
  ];

  const legacyUntagged = [
    { agentRole: "pm", content: "scope" },
    { agentRole: "architect", content: "design" },
    { agentRole: "backend", content: "api" },
    { agentRole: "frontend", content: "ui" },
    { agentRole: "devops", content: "ops" },
    { agentRole: "reviewer", content: "## Review\n\nShip with caution." },
  ];

  it("returns true for explicit approve", () => {
    assert.equal(isDebateComplete(reviewerApprove), true);
  });

  it("fail-closes unknown tagged-like but unparsable reviewer endings", () => {
    assert.equal(
      isDebateComplete([
        {
          agentRole: "reviewer",
          content: "## Review\n\n[REJECT: reviewer]",
        },
      ]),
      false,
    );
  });

  it("returns true for cap-saturated runs", () => {
    const capped = Array.from({ length: 18 }, (_, index) => ({
      agentRole: index % 2 === 0 ? "pm" : "architect",
      content: `turn ${index}`,
    }));
    assert.equal(isDebateComplete(capped), true);
  });

  it("returns true for legacy untagged reviewer completions", () => {
    assert.equal(isDebateComplete(legacyUntagged), true);
    const last = legacyUntagged[legacyUntagged.length - 1]!;
    assert.equal(isLegacyUntaggedReviewerCompletion(last), true);
  });

  it("returns false when the last speaker is not the reviewer", () => {
    assert.equal(
      isDebateComplete([{ agentRole: "devops", content: "done" }]),
      false,
    );
  });
});

describe("parseDebateOutcomeFromRunSummary", () => {
  it("parses JSON debate outcome metadata", () => {
    const outcome = parseDebateOutcomeFromRunSummary(
      JSON.stringify({ debateOutcome: "cap_reached", turnCount: 12 }),
    );
    assert.equal(outcome, "cap_reached");
  });

  it("returns null for invalid or empty summary", () => {
    assert.equal(parseDebateOutcomeFromRunSummary(null), null);
    assert.equal(parseDebateOutcomeFromRunSummary("not json"), null);
    assert.equal(
      parseDebateOutcomeFromRunSummary(
        JSON.stringify({ debateOutcome: "invalid" }),
      ),
      null,
    );
  });
});

describe("classify-project keyword helpers", () => {
  it("detects software keywords", () => {
    assert.equal(hasSoftwareKeywords("Build a Next.js SaaS dashboard"), true);
    assert.equal(hasSoftwareKeywords("renovate the building facade"), false);
  });

  it("detects physical keywords", () => {
    assert.equal(hasPhysicalKeywords("DTU 60.1 ventilation chantier"), true);
    assert.equal(hasPhysicalKeywords("React admin panel"), false);
  });

  it("detects hybrid when both keyword classes match", () => {
    assert.equal(
      isKeywordHybridProject(
        "SvelteKit app for ERP compliance on a construction site",
      ),
      true,
    );
    assert.equal(isKeywordHybridProject("Next.js todo app"), false);
  });
});
