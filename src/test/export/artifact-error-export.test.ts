import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRunMarkdown } from "@/lib/export/build-run-export-document";
import type { MockRun } from "@/lib/types";

function baseRun(overrides: Partial<MockRun> = {}): MockRun {
  return {
    id: "run_export_artifact_error",
    title: "Study group",
    userPrompt: "Create a study group matching platform",
    status: "complete",
    updatedAt: new Date("2026-07-21T12:00:00.000Z").toISOString(),
    messages: [],
    artifacts: {
      requirements: [
        {
          title: "Synthesis failed",
          items: ["The requirements artifact could not be generated."],
        },
      ],
    },
    debateOutcome: "approved",
    artifactError: {
      message:
        "Artifact synthesis blocked: run still treated as in progress after debate approval",
      failedArtifact: "requirements",
      timestamp: "2026-07-21T12:05:00.000Z",
      retryFailed: true,
      errorCode: "run_in_progress",
    },
    ...overrides,
  };
}

describe("export artifactError telemetry", () => {
  it("includes an artifactError fenced block when synthesis failed", () => {
    const markdown = buildRunMarkdown({ run: baseRun() });

    assert.match(markdown, /```artifactError/);
    assert.match(markdown, /"failedArtifact": "requirements"/);
    assert.match(markdown, /"retryFailed": true/);
    assert.match(markdown, /run still treated as in progress/);
  });

  it("omits artifactError when synthesis succeeded", () => {
    const markdown = buildRunMarkdown({
      run: baseRun({ artifactError: null }),
    });

    assert.doesNotMatch(markdown, /```artifactError/);
  });
});
