import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCanonicalTranscriptForArtifacts, prepareArtifactTranscript } from "@/ai/artifacts/build-transcript";
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

  it("includes merged correction content in the canonical backend message", () => {
    const transcript: TranscriptEntry[] = [
      { role: "backend", agentName: "Sam", content: "Backend v1 API surface." },
      { role: "reviewer", agentName: "Nico", content: "Reject backend" },
      {
        role: "backend",
        agentName: "Sam",
        content: "## Changes\n\nDeferred SCIM to v1.5.",
      },
    ];

    const canonical = prepareArtifactTranscript(transcript);
    const backendEntry = canonical.find((entry) => entry.role === "backend");

    assert.ok(backendEntry);
    assert.match(backendEntry.content, /Backend v1 API surface/);
    assert.match(backendEntry.content, /Deferred SCIM to v1\.5/);
  });
});
