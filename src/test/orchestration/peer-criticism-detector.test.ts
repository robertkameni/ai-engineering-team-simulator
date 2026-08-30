import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import { buildCritiqueMatrix } from "@/ai/orchestration/peer-criticism-detector";

describe("buildCritiqueMatrix", () => {
  const roster = createSimulationRoster("software");

  it("captures verbatim challenges between teammates", () => {
    const transcript = [
      {
        role: "pm" as const,
        agentName: roster.pm.name,
        content: `## Day-2 Ops\n\n${roster.frontend.name} proposed node-cron but it has no retry and no dead-letter handling — a real flaw I am challenging before it ships.`,
      },
      {
        role: "architect" as const,
        agentName: roster.architect.name,
        content: `## Decisions\n\nReject ${roster.frontend.name}'s node-cron; adopt pg-boss.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const pm = matrix.find((entry) => entry.role === "pm")!;
    assert.ok(
      pm.critiques.some(
        (critique) =>
          critique.targetRole === "frontend" &&
          critique.excerpt.includes("node-cron"),
      ),
    );

    const architect = matrix.find((entry) => entry.role === "architect")!;
    assert.ok(
      architect.critiques.some((critique) => critique.targetRole === "frontend"),
    );
  });

  it("leaves silent roles with no detected critique", () => {
    const transcript = [
      {
        role: "pm" as const,
        agentName: roster.pm.name,
        content: "## Scope\n\nPlain scope statement with no teammate mentions.",
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const pm = matrix.find((entry) => entry.role === "pm")!;
    assert.equal(pm.critiques.length, 0);

    const backend = matrix.find((entry) => entry.role === "backend")!;
    assert.equal(backend.critiques.length, 0);
  });

  it("does not count self-mention as a critique", () => {
    const transcript = [
      {
        role: "pm" as const,
        agentName: roster.pm.name,
        content: `## Scope\n\n${roster.pm.name} will own the onboarding flow and the metrics definition.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const pm = matrix.find((entry) => entry.role === "pm")!;
    assert.equal(pm.critiques.length, 0);
  });

  it("detects an 'I challenge' phrasing (no other critical keyword)", () => {
    const transcript = [
      {
        role: "pm" as const,
        agentName: roster.pm.name,
        content: "## Scope\n\nManual-entry ledger for roommates.",
      },
      {
        role: "architect" as const,
        agentName: roster.architect.name,
        content: "## Summary\n\nSingle worker process with concurrency 1.",
      },
      {
        role: "backend" as const,
        agentName: roster.backend.name,
        content: `## Summary\n\n${roster.architect.name}'s model is sound, but I challenge the single-worker concurrency-1 choice: it serializes independent recurring drafts and email sends, delaying low-priority work behind slow email throttling.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const backend = matrix.find((entry) => entry.role === "backend")!;
    assert.ok(
      backend.critiques.some(
        (critique) =>
          critique.targetRole === "architect" &&
          critique.excerpt.includes("I challenge"),
      ),
    );
  });

  it("detects a contrastive cost challenge without challenge or gap keywords", () => {
    const transcript = [
      {
        role: "backend" as const,
        agentName: roster.backend.name,
        content: `## Decisions\n\n${roster.architect.name}'s model is well-normalized for a trip planner, but \`BudgetLine\` as a separate 1:N table adds join cost without query benefit—fold it into \`Day\` as a JSON column.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const backend = matrix.find((entry) => entry.role === "backend")!;
    assert.ok(
      backend.critiques.some(
        (critique) =>
          critique.targetRole === "architect" &&
          critique.excerpt.includes("BudgetLine") &&
          critique.excerpt.includes("adds join cost"),
      ),
    );
  });

  it("detects an under-normalized split challenge without challenge or gap keywords", () => {
    const transcript = [
      {
        role: "backend" as const,
        agentName: roster.backend.name,
        content: `## Summary\n\n${roster.architect.name}'s model is sound but under-normalized for signatures: storing SHA-256 hash on the signature row couples content-addressing with metadata. I split into SignatureDocument and SignatureRecord for independent verification.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const backend = matrix.find((entry) => entry.role === "backend")!;
    assert.ok(
      backend.critiques.some(
        (critique) =>
          critique.targetRole === "architect" &&
          critique.excerpt.includes("under-normalized") &&
          critique.excerpt.includes("I split into"),
      ),
    );
  });

  it("detects a scope-conflict challenge without challenge or gap keywords", () => {
    const transcript = [
      {
        role: "architect" as const,
        agentName: roster.architect.name,
        content: `## Risks\n\n**Scope contradiction:** ${roster.pm.name}'s "no offline sync" conflicts with retried background photo uploads — this is a client-side outbox.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const architect = matrix.find((entry) => entry.role === "architect")!;
    assert.ok(
      architect.critiques.some(
        (critique) =>
          critique.targetRole === "pm" &&
          critique.excerpt.includes("conflicts with"),
      ),
    );
  });

  it("detects a contrastive but-your challenge without challenge or gap keywords", () => {
    const transcript = [
      {
        role: "frontend" as const,
        agentName: roster.frontend.name,
        content: `${roster.backend.name}, your split-queue and photo_id idempotency keys are solid — but your POST /api/findings/:id/photos returning 202 with an outbox row forces the client to treat upload as eventually-consistent.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const frontend = matrix.find((entry) => entry.role === "frontend")!;
    assert.ok(
      frontend.critiques.some(
        (critique) =>
          critique.targetRole === "backend" &&
          critique.excerpt.includes("forces the client"),
      ),
    );
  });

  it("treats a display-name CHALLENGE tag as a critique", () => {
    const transcript = [
      {
        role: "architect" as const,
        agentName: roster.architect.name,
        content: `Your 12-minute median assumes vendor toggles are reliable. [CHALLENGE: ${roster.pm.name}] Added a stale-status alert.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const architect = matrix.find((entry) => entry.role === "architect")!;
    assert.ok(
      architect.critiques.some(
        (critique) =>
          critique.targetRole === "pm" &&
          critique.excerpt.includes(`[CHALLENGE: ${roster.pm.name}]`),
      ),
    );
  });

  it("treats a CHALLENGE tag as a critique without critical-language regex", () => {
    const transcript = [
      {
        role: "architect" as const,
        agentName: roster.architect.name,
        content: `${roster.pm.name} left PDF hosting unspecified. [CHALLENGE: pm] Dedicated worker, not serverless.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const architect = matrix.find((entry) => entry.role === "architect")!;
    assert.ok(
      architect.critiques.some(
        (critique) =>
          critique.targetRole === "pm" &&
          critique.excerpt.includes("[CHALLENGE: pm]"),
      ),
    );
  });

  it("does not treat contrastive praise as a critique", () => {
    const transcript = [
      {
        role: "backend" as const,
        agentName: roster.backend.name,
        content: `## Decisions\n\n${roster.architect.name}'s model is well-normalized and I adopt it wholesale.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const backend = matrix.find((entry) => entry.role === "backend")!;
    assert.equal(backend.critiques.length, 0);
  });

  it("treats plural 'gaps' as a critical-language signal", () => {
    const transcript = [
      {
        role: "pm" as const,
        agentName: roster.pm.name,
        content: "## Scope\n\nShared ledger for roommates.",
      },
      {
        role: "devops" as const,
        agentName: roster.devops.name,
        content: `## Risks\n\n${roster.architect.name}'s plan has gaps in outbox lease handling — a worker can double-process a job.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const devops = matrix.find((entry) => entry.role === "devops")!;
    assert.ok(
      devops.critiques.some((critique) => critique.targetRole === "architect"),
    );
  });

  it("keeps a verbatim challenge buried in a >600-char paragraph", () => {
    const longChallenge = `${roster.backend.name}, your split \`Event\`/\`Outbox\` tables with a shared transaction are sound — the poller reading only \`Outbox\` keeps the hot path clean. But your \`GET /api/events\` keyset pagination returns raw events, which forces the client to compute deltas (upgrade/downgrade flows) locally. I'll challenge that: the dashboard needs derived transitions, not raw events. I'm adding a client-side normalization layer that maps \`occurredAt\`-ordered events into transition objects, but this only works if your API guarantees strict ordering by \`(subscriptionId, occurredAt)\` — confirm the composite index enforces that.`;
    assert.ok(longChallenge.length > 600, "fixture must exceed the old cap");

    const transcript = [
      {
        role: "frontend" as const,
        agentName: roster.frontend.name,
        content: `## UI & Routing\n\n${longChallenge}`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);

    const frontend = matrix.find((entry) => entry.role === "frontend")!;
    assert.ok(
      frontend.critiques.some(
        (critique) =>
          critique.targetRole === "backend" &&
          critique.excerpt.includes("I'll challenge that"),
      ),
    );
  });
});
