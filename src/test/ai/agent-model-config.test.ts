import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  DEEPSEEK_CHAT_OPTIONS,
  DEEPSEEK_REASONING_OPTIONS,
} from "@/ai/deepseek-options";
import {
  getAgentConfig,
  resolveArchitectModel,
  supportsTemperature,
  type AgentModelConfig,
} from "@/ai/agents/config";
import type { DeepSeekModelId } from "@/ai/providers";

function buildConfig(
  deepseek: AgentModelConfig["deepseek"],
): AgentModelConfig {
  return {
    role: "pm",
    model: "deepseek-v4-flash" satisfies DeepSeekModelId,
    maxOutputTokens: 1700,
    temperature: 0.4,
    deepseek,
  };
}

describe("resolveArchitectModel", () => {
  afterEach(() => {
    delete process.env.ARCHITECT_MODEL;
  });

  it("defaults to the pro reasoning model", () => {
    assert.equal(resolveArchitectModel(), "deepseek-v4-pro");
  });

  it("uses flash when ARCHITECT_MODEL is set to deepseek-v4-flash", () => {
    process.env.ARCHITECT_MODEL = "deepseek-v4-flash";
    assert.equal(resolveArchitectModel(), "deepseek-v4-flash");
  });

  it("ignores unknown ARCHITECT_MODEL values", () => {
    process.env.ARCHITECT_MODEL = "deepseek-v4-gpt";
    assert.equal(resolveArchitectModel(), "deepseek-v4-pro");
  });
});

describe("supportsTemperature", () => {
  it("is true for chat roles with thinking disabled", () => {
    // Arrange
    const pm = getAgentConfig("pm");
    const backend = getAgentConfig("backend");
    const reviewer = getAgentConfig("reviewer");

    // Act & Assert
    assert.equal(pm.deepseek, DEEPSEEK_CHAT_OPTIONS);
    assert.equal(supportsTemperature(pm), true);
    assert.equal(supportsTemperature(backend), true);
    assert.equal(supportsTemperature(reviewer), true);
  });

  it("is false for the reasoning architect model", () => {
    // Arrange
    const architect = getAgentConfig("architect");

    // Act & Assert
    assert.equal(architect.deepseek, DEEPSEEK_REASONING_OPTIONS);
    assert.equal(supportsTemperature(architect), false);
  });

  it("is false when thinking is omitted (defaults to enabled)", () => {
    // Act & Assert
    assert.equal(supportsTemperature(buildConfig({})), false);
  });
});
