import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCorrectionTurnContent,
  mergeCorrectionTurns,
} from "@/ai/artifacts/merge-correction-turns";
import type { TranscriptEntry } from "@/ai/context/transcript";

describe("mergeCorrectionTurns", () => {
  it("merges a correction turn with the prior message from the same role", () => {
    const transcript: TranscriptEntry[] = [
      { role: "backend", agentName: "Quinn", content: "Backend v1 with full API plan." },
      { role: "reviewer", agentName: "Alex", content: "Reject backend outbox sharding." },
      {
        role: "backend",
        agentName: "Quinn",
        content: "## Changes\n\nDeferred SCIM to v1.5.",
      },
    ];

    const merged = mergeCorrectionTurns(transcript);

    assert.equal(merged.length, 2);
    assert.match(merged[0]!.content, /Backend v1 with full API plan/);
    assert.match(merged[0]!.content, /Deferred SCIM to v1\.5/);
  });

  it("leaves non-correction turns unchanged", () => {
    const transcript: TranscriptEntry[] = [
      { role: "pm", agentName: "Cameron", content: "PM scope only once." },
      { role: "architect", agentName: "Robin", content: "Architecture plan." },
    ];

    const merged = mergeCorrectionTurns(transcript);

    assert.deepEqual(merged, transcript);
  });

  it("detects correction turns by ## Changes heading", () => {
    assert.equal(isCorrectionTurnContent("## Changes\n\nFix outbox."), true);
    assert.equal(isCorrectionTurnContent("## Stack\n\nNormal turn."), false);
  });
});
