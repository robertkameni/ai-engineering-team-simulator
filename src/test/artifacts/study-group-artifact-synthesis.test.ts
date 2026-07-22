import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFailedArtifactPlaceholder,
  listMissingCoreArtifactTypes,
} from "@/ai/artifacts/failed-artifact-placeholder";
import {
  getRegenerateBlockingError,
  isDebateCompleteForArtifactSynthesis,
} from "@/ai/artifacts/regenerate-run-eligibility";
import { CORE_ARTIFACT_TYPES } from "@/lib/artifact-constants";

describe("isDebateCompleteForArtifactSynthesis", () => {
  it("allows synthesis when summary is approved even if last reviewer rejected", () => {
    const messages = [
      { agentRole: "pm", content: "Scope" },
      { agentRole: "architect", content: "Design" },
      { agentRole: "backend", content: "API" },
      { agentRole: "frontend", content: "UI" },
      { agentRole: "devops", content: "Ops" },
      {
        agentRole: "reviewer",
        content:
          "Three unresolved risks remain.\n\n[REJECT: backend]",
      },
    ];

    assert.equal(
      isDebateCompleteForArtifactSynthesis({
        messages,
        debateOutcome: "approved",
      }),
      true,
    );
    assert.equal(
      getRegenerateBlockingError("running", "pending", true),
      null,
    );
  });

  it("still blocks when neither messages nor summary show completion", () => {
    const messages = [
      { agentRole: "pm", content: "Scope" },
      {
        agentRole: "reviewer",
        content: "Still open.\n\n[REJECT: architect]",
      },
    ];

    assert.equal(
      isDebateCompleteForArtifactSynthesis({
        messages,
        debateOutcome: null,
      }),
      false,
    );
    assert.equal(
      getRegenerateBlockingError("running", "pending", false),
      "run_in_progress",
    );
  });
});

describe("failed artifact placeholders", () => {
  it("builds a marked placeholder and fills missing core types to 5/5", () => {
    const placeholder = buildFailedArtifactPlaceholder(
      "requirements",
      "Structured output parse failed",
    );

    assert.equal(placeholder.artifactSynthesisFailed, true);
    assert.match(placeholder.artifactErrorMessage ?? "", /parse failed/i);
    assert.equal(placeholder.sections.length, 1);

    const missing = listMissingCoreArtifactTypes(new Set(["requirements"]));
    assert.deepEqual(missing, [
      "architecture",
      "implementation",
      "blueprint",
      "review",
    ]);
    assert.equal(
      listMissingCoreArtifactTypes([]).length,
      CORE_ARTIFACT_TYPES.length,
    );
  });
});
