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

  it("dedupes verbatim duplicate consecutive dump sections", () => {
    const risks = [
      "## Backend Risks",
      "- Geocoder outage: accept null coords, backfill async.",
    ].join("\n");

    const result = normalizeSectionDumpOutput(
      `## Summary\nCore write path.\n\n${risks}\n\n${risks}\n\n## Day-2 Ops\n- Backup nightly.`,
    );

    assert.equal(result.diagnostics.beforeDumpSectionCount, 2);
    assert.equal(result.diagnostics.afterDumpSectionCount, 1);
    assert.equal(result.diagnostics.wasNormalized, true);
    assert.equal(
      (result.content.match(/^##\s+Backend Risks/gim) ?? []).length,
      1,
    );
    assert.equal((result.content.match(/Geocoder outage/g) ?? []).length, 1);
  });

  it("dedupes an exact re-emitted dump section even when not consecutive", () => {
    const risks = [
      "## Risks",
      "**Risk 1:** Food-bank API version drift is unpinned.",
      "**Risk 2:** Outbox replay is not idempotent.",
    ].join("\n");

    const result = normalizeSectionDumpOutput(
      `## Changes\nFixed both risks.\n\n${risks}\n\n## Monitoring\nHeartbeat alert added.\n\n${risks}`,
    );

    assert.equal(result.diagnostics.beforeDumpSectionCount, 2);
    assert.equal(result.diagnostics.afterDumpSectionCount, 1);
    assert.equal(
      (result.content.match(/^##\s+Risks/gim) ?? []).length,
      1,
    );
    assert.equal((result.content.match(/Outbox replay is not idempotent/g) ?? []).length, 1);
  });

  it("keeps a superset re-emission so new bullets are not lost", () => {
    const first = "## Risks\n**Risk 1:** Food-bank API version drift is unpinned.";
    const superset =
      "## Risks\n**Risk 1:** Food-bank API version drift is unpinned.\n**Risk 2:** Outbox replay is not idempotent.";

    const result = normalizeSectionDumpOutput(
      `## Changes\n${first}\n\n${superset}`,
    );

    assert.equal(result.diagnostics.beforeDumpSectionCount, 2);
    assert.equal(result.diagnostics.afterDumpSectionCount, 2);
    assert.match(result.content, /Risk 2/);
  });

  it("keeps distinct dump sections that only share a family heading", () => {
    const result = normalizeSectionDumpOutput(
      "## Backend Risks\nRisk A content.\n\n## Frontend Risks\nRisk B content.",
    );

    assert.equal(result.diagnostics.beforeDumpSectionCount, 2);
    assert.equal(result.diagnostics.afterDumpSectionCount, 2);
    assert.equal(result.diagnostics.wasNormalized, false);
    assert.equal(
      (result.content.match(/^##\s+(Backend|Frontend) Risks/gim) ?? []).length,
      2,
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
