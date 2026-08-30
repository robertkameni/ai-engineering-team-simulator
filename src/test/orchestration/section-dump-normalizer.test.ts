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

  it("dedupes identical bullets repeated inside a single dump section", () => {
    const duplicatedRisks = [
      "## Backend Risks",
      "- **Redis starvation**: queue workers idle when the cache is full.",
      "- **Orphaned jobs on restore**: replay must skip completed outbox rows.",
      "- **BudgetLine JSON limits**: fold the table if queries never filter it.",
      "- **Redis starvation**: queue workers idle when the cache is full.",
      "- **Orphaned jobs on restore**: replay must skip completed outbox rows.",
      "- **BudgetLine JSON limits**: fold the table if queries never filter it.",
    ].join("\n");

    const result = normalizeSectionDumpOutput(
      `## Summary\nAdopt the restore skip.\n\n${duplicatedRisks}`,
    );

    assert.equal((result.content.match(/Redis starvation/g) ?? []).length, 1);
    assert.equal((result.content.match(/Orphaned jobs on restore/g) ?? []).length, 1);
    assert.equal((result.content.match(/BudgetLine JSON limits/g) ?? []).length, 1);
    assert.equal(result.diagnostics.wasNormalized, true);
  });

  it("replaces a restated Risks section when wording drifts but risk keys match", () => {
    const first = [
      "## Risks",
      "**Risk 1:** Outbox crash loses an alert. Mitigation: worker retries with an idempotency key.",
      "**Risk 2:** Backup overlaps a migration.",
    ].join("\n");
    const restated = [
      "## Risks",
      "**Risk 1:** Outbox crash loses an alert. Mitigation: the worker retries with an idempotency key; PENDING rows are re-driven.",
      "**Risk 2:** Backup overlaps a migration. Mitigation: advisory lock.",
      "**Risk 4:** Row locks queue technicians. Mitigation: token-bucket throttle.",
    ].join("\n");

    const result = normalizeSectionDumpOutput(
      `## Automated Backup\nNightly dump.\n\n${first}\n\n## Automated Backup (finalized)\nPinned client.\n\n${restated}`,
    );

    assert.equal(result.diagnostics.afterDumpSectionCount, 1);
    assert.match(result.content, /PENDING rows are re-driven/);
    assert.match(result.content, /token-bucket throttle/);
    assert.equal((result.content.match(/\*\*Risk 1:\*\*/g) ?? []).length, 1);
  });

  it("treats a continued dump heading as the same family", () => {
    const first = "## Backend Risks\n- **Outbox stall**: alert if depth >20.";
    const continued =
      "## Backend Risks (continued)\n- **Outbox stall**: alert if depth >20; DLQ replay.";

    const result = normalizeSectionDumpOutput(
      `## Summary\nTighten worker semantics.\n\n${first}\n\n${continued}`,
    );

    assert.equal(result.diagnostics.afterDumpSectionCount, 1);
    assert.match(result.content, /DLQ replay/);
  });

  it("replaces an earlier subset dump section with a later superset", () => {
    const first = "## Backend Risks\n- **Outbox processor stall**: alert if queue depth >20 for 5 min.";
    const superset = [
      "## Backend Risks",
      "- **Outbox processor stall**: alert if queue depth >20 for 5 min; DLQ with manual replay UI.",
      "- **S3 presign race**: pending row expires after 15 min; client retries on 403.",
    ].join("\n");

    const result = normalizeSectionDumpOutput(
      `## Summary\nTighten worker semantics.\n\n${first}\n\n${superset}`,
    );

    assert.equal(result.diagnostics.beforeDumpSectionCount, 2);
    assert.equal(result.diagnostics.afterDumpSectionCount, 1);
    assert.equal((result.content.match(/^##\s+Backend Risks/gim) ?? []).length, 1);
    assert.match(result.content, /DLQ with manual replay/);
    assert.match(result.content, /S3 presign race/);
    assert.equal(result.diagnostics.wasNormalized, true);
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
