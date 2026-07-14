import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildConsensusDirectives } from "@/ai/artifacts/build-consensus-directives";
import type { TranscriptEntry } from "@/ai/context/transcript";

describe("buildConsensusDirectives", () => {
  it("extracts deferred scope decisions from later teammate messages", () => {
    const transcript: TranscriptEntry[] = [
      {
        role: "pm",
        agentName: "Cameron",
        content: "Core Features: automated SCIM provisioning in v1.",
      },
      {
        role: "architect",
        agentName: "Robin",
        content:
          "## Challenging Cameron's Scope\n\nSCIM deferred to v1.5; use Slack webhook manifest instead.",
      },
    ];

    const directives = buildConsensusDirectives(transcript);

    assert.match(directives, /Resolved consensus/);
    assert.match(directives, /SCIM deferred to v1\.5/i);
    assert.match(directives, /revised v1 scope/);
  });

  it("returns an empty string when no consensus revisions are found", () => {
    const transcript: TranscriptEntry[] = [
      { role: "pm", agentName: "Harper", content: "Simple scope with no revisions." },
    ];

    assert.equal(buildConsensusDirectives(transcript), "");
  });
});
