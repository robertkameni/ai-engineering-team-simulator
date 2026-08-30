import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import { buildCritiqueMatrix } from "@/ai/orchestration/peer-criticism-detector";

describe("tmp jamie matrix check", () => {
  it("detects architect challenging PM", () => {
    const roster = createSimulationRoster("software");
    const transcript = [
      {
        role: "architect" as const,
        agentName: roster.architect.name,
        content: `## Decisions

- **Decision:** On-demand synchronous backfill on key connect, recency-first and paginated; nightly batch becomes delta reconciliation. I'm challenging ${roster.pm.name}'s "nightly is sufficient" — it cannot meet the 10-minute TTFV gate. Cost: rate-limit backpressure.`,
      },
    ];

    const matrix = buildCritiqueMatrix(transcript, roster);
    const architect = matrix.find((entry) => entry.role === "architect");
    console.log(JSON.stringify(architect, null, 2));
    assert.ok(
      architect?.critiques.some(
        (critique) =>
          critique.targetRole === "pm" && critique.excerpt.includes("challenging"),
      ),
    );
  });
});
