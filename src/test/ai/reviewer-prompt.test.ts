import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import { buildReviewerSystemPrompt } from "@/ai/prompts/reviewer";

describe("buildReviewerSystemPrompt", () => {
  const roster = createSimulationRoster("software");

  it("keeps the cross-critique matrix authoritative with a verbatim transcript override", () => {
    const prompt = buildReviewerSystemPrompt(roster);
    const rule = prompt
      .split("\n")
      .find((line) => line.startsWith("- ## Cross-Critique Compliance"));

    assert.ok(rule);
    assert.match(rule, /server-computed cross-critique matrix/);
    assert.match(rule, /quote a challenge directly and verbatim from that role's own message/);
    assert.match(rule, /an attribution you cannot quote verbatim is a hallucination/);
    assert.match(rule, /a role with a matrix challenge is never reported as "no verbatim critique detected"/);
  });
});
