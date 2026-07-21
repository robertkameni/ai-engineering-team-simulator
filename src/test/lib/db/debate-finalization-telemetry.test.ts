import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDebateFinalizationTelemetry,
  parseDebateFinalizationTelemetry,
} from "@/lib/db/debate-finalization-telemetry";
import {
  buildRunSummaryPayload,
  parseRunSummary,
} from "@/lib/db/run-summary";

describe("debate finalization telemetry", () => {
  it("persists and parses the unified finalization object", () => {
    const finalization = buildDebateFinalizationTelemetry({
      reason: "Software debate reached deterministic finalization priority.",
      rejectCount: 2,
      correctionsByRole: { backend: 1, devops: 1 },
      acceptedCriticalRisks: [
        {
          issueId: "ri_security",
          targetRole: "backend",
          category: "security",
          excerpt: "Auth refresh race can leak sessions.",
          acceptedOnTurn: 8,
        },
      ],
      outputDiagnostics: {
        beforeDumpSectionCount: 20,
        afterDumpSectionCount: 5,
        wasNormalized: true,
        wasHardCapped: false,
        originalCharCount: 12_000,
        finalCharCount: 4_000,
      },
    });

    const encoded = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 9,
      finalization,
    });
    const parsed = parseRunSummary(encoded);

    assert.ok(parsed?.finalization);
    assert.equal(
      parsed.finalization.reason,
      "Software debate reached deterministic finalization priority.",
    );
    assert.equal(parsed.finalization.rejectCount, 2);
    assert.equal(parsed.finalization.correctionsByRole.backend, 1);
    assert.equal(parsed.finalization.acceptedCriticalRisks.length, 1);
    assert.equal(parsed.finalization.acceptedCriticalRisks[0]?.category, "security");
    assert.equal(parsed.finalization.outputDiagnostics?.wasNormalized, true);
  });

  it("rejects malformed finalization payloads", () => {
    assert.equal(parseDebateFinalizationTelemetry({ rejectCount: 1 }), undefined);
    assert.equal(parseDebateFinalizationTelemetry(null), undefined);
  });
});
