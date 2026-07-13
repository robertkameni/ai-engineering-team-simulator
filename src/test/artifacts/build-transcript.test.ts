import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCanonicalTranscriptForArtifacts } from "@/ai/artifacts/build-transcript";
import type { TranscriptEntry } from "@/ai/context/transcript";

describe("buildCanonicalTranscriptForArtifacts", () => {
  it("keeps only the latest pipeline message per role and all reviewer messages", () => {
    const transcript: TranscriptEntry[] = [
      { role: "pm", agentName: "Harper", content: "PM v1" },
      { role: "architect", agentName: "Jamie", content: "Architect v1" },
      { role: "backend", agentName: "Sam", content: "Backend v1" },
      { role: "reviewer", agentName: "Nico", content: "Reject backend" },
      { role: "backend", agentName: "Sam", content: "Backend v2" },
      { role: "reviewer", agentName: "Nico", content: "Approve" },
    ];

    const canonical = buildCanonicalTranscriptForArtifacts(transcript);

    assert.deepEqual(
      canonical.map((entry) => `${entry.role}:${entry.content}`),
      [
        "pm:PM v1",
        "architect:Architect v1",
        "reviewer:Reject backend",
        "backend:Backend v2",
        "reviewer:Approve",
      ],
    );
  });
});
