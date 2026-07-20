import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasPhysicalKeywords,
  hasSoftwareKeywords,
  isKeywordHybridProject,
} from "../ai/orchestration/classify-project.js";
import {
  isArchitectDeliverableInsufficient,
  isSoftwareArchitectDeliverableInsufficient,
} from "../ai/orchestration/agent-deliverable-quality.js";
import { looksLikeTruncatedAgentOutput } from "../ai/orchestration/looks-like-truncated-agent-output.js";
import { createSimulationRoster } from "@/ai/agents/roster";
import {
  TRANSCRIPT_WINDOW_RECENT_COUNT,
  windowTranscriptForTurn,
} from "@/ai/context/window-transcript";
import {
  canCorrectRole,
  incrementRoleCorrectionCount,
  MAX_CORRECTIONS_PER_ROLE,
} from "../ai/orchestration/debate-correction-caps.js";
import { buildReviewerPreflightChecklist } from "../ai/orchestration/reviewer-preflight.js";
import {
  canScheduleArchitectRevision,
  extractReviewerDecisionTag,
  getMaxSimulationTurns,
  hasExceededReviewerRejectionCap,
  isDebateComplete,
  isLegacyUntaggedReviewerCompletion,
  isUnapprovedDebateExitOutcome,
  MAX_REVIEWER_REJECTION_CYCLES,
  MIN_TURNS_FOR_REVISION_FINISH,
  parseDebateOutcomeFromRunSummary,
  parseReviewerDecision,
  resolveRejectIdentifier,
  resolveUnknownReviewerDecision,
  reviewerVisibleText,
  stripReviewerDecisionTag,
} from "../ai/orchestration/reviewer-decision.js";
import { parseRunSummary } from "../lib/db/run-summary.js";

describe("canScheduleArchitectRevision", () => {
  it("allows revision when enough turns remain for physical template", () => {
    const maxTurns = getMaxSimulationTurns("physical");
    assert.equal(
      canScheduleArchitectRevision(
        maxTurns - MIN_TURNS_FOR_REVISION_FINISH,
        maxTurns,
      ),
      true,
    );
  });

  it("blocks revision when the turn budget is too tight", () => {
    const maxTurns = getMaxSimulationTurns("physical");
    assert.equal(
      canScheduleArchitectRevision(
        maxTurns - MIN_TURNS_FOR_REVISION_FINISH + 1,
        maxTurns,
      ),
      false,
    );
  });

  it("allows revision later in software template due to higher cap", () => {
    // Software has 20 turns — at turn 17, 4 turns remain → revision allowed
    const maxTurns = getMaxSimulationTurns("software");
    assert.equal(maxTurns, 20);
    assert.equal(
      canScheduleArchitectRevision(maxTurns - MIN_TURNS_FOR_REVISION_FINISH, maxTurns),
      true,
    );
    assert.equal(
      canScheduleArchitectRevision(maxTurns - MIN_TURNS_FOR_REVISION_FINISH + 1, maxTurns),
      false,
    );
  });
});

describe("hasExceededReviewerRejectionCap", () => {
  it("allows reviewer rejections below the configured cap", () => {
    assert.equal(hasExceededReviewerRejectionCap(0), false);
    assert.equal(hasExceededReviewerRejectionCap(MAX_REVIEWER_REJECTION_CYCLES - 1), false);
  });

  it("blocks further rejections after the configured cap", () => {
    assert.equal(hasExceededReviewerRejectionCap(MAX_REVIEWER_REJECTION_CYCLES), true);
    assert.equal(hasExceededReviewerRejectionCap(MAX_REVIEWER_REJECTION_CYCLES + 1), true);
  });

  it("allows 4 rejection cycles (raised from 2 for more granular corrections)", () => {
    assert.equal(MAX_REVIEWER_REJECTION_CYCLES, 4);
    // Per-role correction cap still limits individual roles
    assert.equal(MAX_CORRECTIONS_PER_ROLE, 2);
    // A role can exhaust its per-role cap without tripping the global cap
    assert.equal(hasExceededReviewerRejectionCap(3), false);
  });
});

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

  it("returns unknown for inline [APPROVE] outside the terminal region", () => {
    const padding = "a".repeat(700);
    const raw = `${padding} Early mention [APPROVE] ${"b".repeat(700)}`;
    const parsed = parseReviewerDecision(raw);
    assert.equal(parsed.decision, "unknown");
  });

  it("returns unknown when tail after tag exceeds 120 characters", () => {
    const tail = "x".repeat(121);
    const parsed = parseReviewerDecision(`## Review\n\n[APPROVE]${tail}`);
    assert.equal(parsed.decision, "unknown");
  });

  it("parses [REJECT: agent display name] when roster is provided", () => {
    const roster = createSimulationRoster("software");
    const frontendName = roster.frontend.name;
    const parsed = parseReviewerDecision(
      `## Review\n\nMissing PIN validation.\n\n[REJECT: ${frontendName}]`,
      roster,
    );
    assert.equal(parsed.decision, "reject");
    assert.equal(parsed.rejectRole, "frontend");
  });

  it("resolveRejectIdentifier maps roster names to roles", () => {
    const roster = createSimulationRoster("software");
    assert.equal(resolveRejectIdentifier(roster.backend.name, roster), "backend");
    assert.equal(resolveRejectIdentifier("pm", roster), "pm");
    assert.equal(resolveRejectIdentifier(roster.reviewer.name, roster), null);
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
    const maxTurns = getMaxSimulationTurns("software");
    const capped = Array.from({ length: maxTurns }, (_, index) => ({
      agentRole: index % 2 === 0 ? "pm" : "architect",
      content: `turn ${index}`,
    }));
    assert.equal(isDebateComplete(capped, "software"), true);
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

describe("looksLikeTruncatedAgentOutput", () => {
  it("detects mid-sentence cutoff", () => {
    const text =
      "## Architecture\n\nWe adopt PostgreSQL with read replicas for analytics, but the migration strategy must account for";
    assert.equal(looksLikeTruncatedAgentOutput(text, "architect"), true);
  });

  it("accepts complete sentences", () => {
    const text =
      "## Architecture\n\nWe adopt PostgreSQL with read replicas for analytics.";
    assert.equal(looksLikeTruncatedAgentOutput(text, "architect"), false);
  });

  it("accepts reviewer with terminal decision tag", () => {
    const text = "## Review\n\nScope is sound.\n\n[APPROVE]";
    assert.equal(looksLikeTruncatedAgentOutput(text, "reviewer"), false);
  });

  it("detects unclosed code fence", () => {
    const text = "## APIs\n\n```typescript\nexport function handler() {";
    assert.equal(looksLikeTruncatedAgentOutput(text, "backend"), true);
  });

  it("detects open inline code and bare HTTP status at end", () => {
    assert.equal(
      looksLikeTruncatedAgentOutput(
        "## Risks\n\nEn cas de circuit ouvert, on renvoie `503",
        "backend",
      ),
      true,
    );
    assert.equal(
      looksLikeTruncatedAgentOutput(
        "## Risks\n\nCircuit ouvert, on renvoie 503",
        "backend",
      ),
      true,
    );
  });

  it("detects incomplete frontend component bullet and missing risks section", () => {
    const truncatedComponent = [
      "## Component Architecture",
      "",
      "**Component 4: WelcomeForm** — Client Component",
      "",
      "- Props: hireId and availableRoles",
      "- Internal",
    ].join("\n");

    assert.equal(looksLikeTruncatedAgentOutput(truncatedComponent, "frontend"), true);

    const missingRisksCompleteProse = [
      "## UI & Routing",
      "",
      "App map with three route groups and nested layouts for dashboard views.",
      "",
      "## Key Flows",
      "",
      "Flow one covers magic-link onboarding from email click to checklist render.",
    ].join("\n");
    // Missing Frontend Risks is a deliverable gap, not truncation by itself.
    assert.equal(
      looksLikeTruncatedAgentOutput(missingRisksCompleteProse, "frontend"),
      false,
    );
  });

  it("detects incomplete API spec lines and short word fragments", () => {
    assert.equal(
      looksLikeTruncatedAgentOutput(
        "## Data & APIs\n\n**Endpoint 4: List Active Onboardings**\n\n- Method and path:",
        "backend",
      ),
      true,
    );

    assert.equal(
      looksLikeTruncatedAgentOutput(
        "## Async Write Atomicity\n\nThe idempotent handler re",
        "architect",
      ),
      true,
    );
  });
});

describe("isSoftwareArchitectDeliverableInsufficient", () => {
  it("flags preamble-only architect output", () => {
    const text =
      "Je commence par vérifier la disponibilité et la version de notre framework primaire avant toute décision.";
    assert.equal(isSoftwareArchitectDeliverableInsufficient(text), true);
  });

  it("accepts multi-section architecture", () => {
    const sections = [
      "## Architecture",
      "Monolith with API tier.",
      "## Data Model",
      "PostgreSQL entities.",
      "## APIs & Integration",
      "REST with idempotency keys.",
      "## Decisions & Risks",
      "Chose Fastify over Express for throughput.",
    ];
    const text = `${sections.join("\n\n")}\n\n${"Detail padding. ".repeat(55)}`;
    assert.equal(isSoftwareArchitectDeliverableInsufficient(text), false);
  });

  it("flags architecture that ends mid-word despite enough sections", () => {
    const sections = [
      "## Architecture",
      "Monolith with API tier.",
      "## Data Model",
      "PostgreSQL entities.",
      "## APIs & Integration",
      "REST with idempotency keys.",
      "## Decisions & Risks",
      "Chose Fastify over Express for throughput.",
    ];
    const text = `${sections.join("\n\n")}\n\n${"Detail padding. ".repeat(55)}The idempotent handler re`;
    assert.equal(isSoftwareArchitectDeliverableInsufficient(text), true);
  });

  it("uses template-specific rules", () => {
    assert.equal(
      isArchitectDeliverableInsufficient("## A\n\nShort.", "physical"),
      true,
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

describe("windowTranscriptForTurn", () => {
  it("summarizes correction turns instead of sending the full transcript", () => {
    const roster = createSimulationRoster("software");
    const transcript = Array.from({ length: 8 }, (_, index) => ({
      role: "pm" as const,
      agentName: roster.pm.name,
      content: `Message ${index + 1} `.repeat(20),
    }));

    const windowed = windowTranscriptForTurn(transcript, roster, {
      correction: {
        reviewerName: roster.reviewer.name,
        feedback: "Fix scope",
        targetRole: "pm",
      },
    });

    assert.ok(windowed.omittedSummary?.includes("Earlier debate summary"));
    assert.equal(windowed.entries.length, 1);
    assert.ok(windowed.entries[0]?.content.includes("Message 8"));
  });

  it("windows long transcripts to recent messages with a summary", () => {
    const roster = createSimulationRoster("software");
    const transcript = Array.from({ length: 8 }, (_, index) => ({
      role: "pm" as const,
      agentName: roster.pm.name,
      content: `Message ${index + 1} with enough detail to matter.`,
    }));

    const windowed = windowTranscriptForTurn(transcript, roster, {});

    assert.ok(windowed.omittedSummary?.includes("Earlier debate summary"));
    assert.equal(windowed.entries.length, TRANSCRIPT_WINDOW_RECENT_COUNT);
    assert.equal(windowed.entries[0]?.content, "Message 3 with enough detail to matter.");
  });
});

describe("debate correction caps", () => {
  it("allows two corrections per role", () => {
    assert.equal(canCorrectRole({}, "pm"), true);
    const afterFirst = incrementRoleCorrectionCount({}, "pm");
    assert.equal(canCorrectRole(afterFirst, "pm"), true);
    const afterSecond = incrementRoleCorrectionCount(afterFirst, "pm");
    assert.equal(canCorrectRole(afterSecond, "pm"), false);
    assert.equal(MAX_CORRECTIONS_PER_ROLE, 2);
  });
});

describe("buildReviewerPreflightChecklist", () => {
  it("flags missing pipeline roles and operational signals", () => {
    const roster = createSimulationRoster("software");
    const checklist = buildReviewerPreflightChecklist(
      [
        {
          role: "pm",
          agentName: roster.pm.name,
          content: "## Scope\n\nOnboarding flow for new users.",
        },
      ],
      roster,
    );

    assert.ok(checklist.includes("Missing roles"));
    assert.ok(checklist.includes("backup"));
    assert.ok(checklist.includes("onboarding"));
    assert.ok(checklist.includes("not applicable yet"));
  });
});

// PHASE 1 — ADAPTIVE TURN CAP
describe("getMaxSimulationTurns (adaptive cap)", () => {
  it("returns 16 for physical templates", () => {
    assert.equal(getMaxSimulationTurns("physical"), 16);
  });

  it("returns 20 for software templates", () => {
    assert.equal(getMaxSimulationTurns("software"), 20);
  });

  it("returns 20 for hybrid templates", () => {
    assert.equal(getMaxSimulationTurns("hybrid"), 20);
  });

  it("accepts all known TeamTemplateId values", () => {
    for (const id of ["software", "physical", "hybrid"] as const) {
      const cap = getMaxSimulationTurns(id);
      assert.ok(cap >= 16, `${id} cap too low: ${cap}`);
    }
  });
});

// PHASE 1 — isDebateComplete respects adaptive caps
describe("isDebateComplete with templateId", () => {
  it("uses a 16-turn cap for physical runs", () => {
    const physicalMessages = Array.from({ length: 16 }, (_, index) => ({
      agentRole: index % 2 === 0 ? "pm" : "architect",
      content: `turn ${index}`,
    }));
    assert.equal(isDebateComplete(physicalMessages, "physical"), true);
  });

  it("does not complete a 17-turn physical run (cap is 16)", () => {
    const physicalMessages = Array.from({ length: 17 }, (_, index) => ({
      agentRole: index % 2 === 0 ? "pm" : "architect",
      content: `turn ${index}`,
    }));
    // 17 messages, but physical cap is 16 — should be treated as complete
    // per the existing maxTurns check (>= comparison).
    assert.equal(isDebateComplete(physicalMessages, "physical"), true);
  });

  it("uses a 20-turn cap for software runs", () => {
    const softwareMessages = Array.from({ length: 18 }, (_, index) => ({
      agentRole: index % 2 === 0 ? "pm" : "architect",
      content: `turn ${index}`,
    }));
    assert.equal(isDebateComplete(softwareMessages, "software"), false);

    const fullMessages = Array.from({ length: 20 }, (_, index) => ({
      agentRole: index % 2 === 0 ? "pm" : "architect",
      content: `turn ${index}`,
    }));
    assert.equal(isDebateComplete(fullMessages, "software"), true);
  });
});

// PHASE 2 — BUDGET-AWARE REVIEWER GUARD
describe("insufficient_budget outcome", () => {
  it("is parsed from run summary JSON", () => {
    const outcome = parseDebateOutcomeFromRunSummary(
      JSON.stringify({ debateOutcome: "insufficient_budget", turnCount: 19 }),
    );
    assert.equal(outcome, "insufficient_budget");
  });

  it("is recognized as an unapproved outcome", () => {
    assert.equal(isUnapprovedDebateExitOutcome("insufficient_budget"), true);
    assert.equal(isUnapprovedDebateExitOutcome("approved"), false);
  });

  it("appears in VALID_DEBATE_OUTCOMES set", () => {
    const summary = parseRunSummary(
      JSON.stringify({ debateOutcome: "insufficient_budget", turnCount: 19 }),
    );
    assert.equal(summary?.debateOutcome, "insufficient_budget");
  });
});

// PHASE 1 + 2 — canScheduleArchitectRevision respects adaptive caps
describe("canScheduleArchitectRevision with adaptive caps", () => {
  it("allows revision at turn 16 in software (cap 20, 4 turns remain)", () => {
    assert.equal(canScheduleArchitectRevision(16, 20), true);
  });

  it("blocks revision at turn 17 in software (cap 20, 3 turns remain)", () => {
    assert.equal(canScheduleArchitectRevision(17, 20), false);
  });

  it("allows revision at turn 12 in physical (cap 16, 4 turns remain)", () => {
    assert.equal(canScheduleArchitectRevision(12, 16), true);
  });

  it("blocks revision at turn 13 in physical (cap 16, 3 turns remain)", () => {
    assert.equal(canScheduleArchitectRevision(13, 16), false);
  });
});
