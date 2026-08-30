import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSimulationStackReferenceDirective } from "@/ai/context/simulation-stack-reference";
import { buildDeepFocusSkillDirective } from "@/ai/prompts/deep-focus";

describe("buildSimulationStackReferenceDirective", () => {
  it("does not leak the host AI SDK stack into the simulated team", () => {
    const directive = buildSimulationStackReferenceDirective();

    assert.doesNotMatch(directive, /@ai-sdk\/deepseek/);
    assert.doesNotMatch(directive, /^-\s+ai:/m);
  });

  it("keeps the generic web stack versions available", () => {
    const directive = buildSimulationStackReferenceDirective();

    assert.match(directive, /next:/);
    assert.match(directive, /prisma:/);
    assert.match(directive, /zod:/);
  });

  it("forbids AI features no teammate proposed", () => {
    const directive = buildSimulationStackReferenceDirective();

    assert.match(directive, /Do not introduce AI/);
  });

  it("forbids host-repository references in deliverables", () => {
    const directive = buildSimulationStackReferenceDirective();

    assert.match(directive, /package\.json/);
    assert.match(directive, /host application/);
  });
});

describe("buildDeepFocusSkillDirective", () => {
  it("requires evidence for tested/verified/automated capability claims", () => {
    const directive = buildDeepFocusSkillDirective();

    assert.match(directive, /Never state that a capability is tested/);
    assert.match(directive, /\[EVIDENCE:/);
    assert.match(directive, /\[CHALLENGE:/);
    assert.match(directive, /\[BLOCKED:/);
  });
});
