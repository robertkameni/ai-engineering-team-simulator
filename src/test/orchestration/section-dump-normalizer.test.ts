import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_TURN_OUTPUT_HARD_CAP_CHARS,
  MAX_REPEATED_SECTION_DUMPS,
  normalizeSectionDumpOutput,
} from "@/ai/orchestration/section-dump-normalizer";
import { MAX_TRUNCATION_CONTINUATIONS } from "@/ai/agents/config";

describe("normalizeSectionDumpOutput", () => {
  it("retains at most five repeated Bottleneck sections", () => {
    const sections = Array.from({ length: 20 }, (_, index) => {
      return `## Bottleneck ${index + 1}\nQueue lag exceeds SLA for shard ${index + 1}.`;
    }).join("\n\n");

    const result = normalizeSectionDumpOutput(
      `## Summary\nCore write path.\n\n${sections}`,
    );

    assert.equal(result.diagnostics.beforeDumpSectionCount, 20);
    assert.equal(
      result.diagnostics.afterDumpSectionCount,
      MAX_REPEATED_SECTION_DUMPS,
    );
    assert.equal(result.diagnostics.wasNormalized, true);
    assert.equal(
      (result.content.match(/^##\s+Bottleneck/gim) ?? []).length,
      MAX_REPEATED_SECTION_DUMPS,
    );
  });

  it("hard-caps aggregate turn output at the configured bound", () => {
    const oversized = `## Summary\n${"x".repeat(AGENT_TURN_OUTPUT_HARD_CAP_CHARS + 2_000)}`;

    const result = normalizeSectionDumpOutput(oversized);

    assert.equal(result.diagnostics.wasHardCapped, true);
    assert.ok(result.content.length <= AGENT_TURN_OUTPUT_HARD_CAP_CHARS + 80);
    assert.match(result.content, /turnOutputHardCap/);
  });
});

describe("truncation continuation bound", () => {
  it("allows at most one bounded continuation stream", () => {
    assert.equal(MAX_TRUNCATION_CONTINUATIONS, 2);
  });
});
