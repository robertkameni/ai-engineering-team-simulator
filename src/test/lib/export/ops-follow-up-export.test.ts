import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MockRun } from "@/features/agents/types";
import { buildRunMarkdown } from "@/lib/export/build-run-export-document";

function buildExportRun(overrides: Partial<MockRun> = {}): MockRun {
  return {
    id: "run_export_test",
    title: "Food delivery platform",
    userPrompt: "Build a food delivery platform",
    status: "completed",
    updatedAt: "2026-07-14T10:00:00.000Z",
    messages: [],
    opsFollowUpEvaluated: true,
    opsFollowUpTriggered: false,
    opsFollowUpSkipReason: "no_unresolved_devops_issues",
    opsFollowUpEligible: false,
    opsFollowUpUnresolvedDevopsIssueCount: 0,
    opsFollowUpLastCorrectionRole: "architect",
    opsFollowUpEvaluationTurn: 11,
    ...overrides,
  };
}

describe("ops follow-up export metadata", () => {
  it("includes ops follow-up fields in markdown export metadata", () => {
    const markdown = buildRunMarkdown({ run: buildExportRun() });

    assert.match(markdown, /\*\*Ops follow-up evaluated:\*\* yes/);
    assert.match(markdown, /\*\*Ops follow-up eligible:\*\* no/);
    assert.match(markdown, /\*\*Ops follow-up triggered:\*\* no/);
    assert.match(
      markdown,
      /\*\*Ops follow-up skip reason:\*\* no_unresolved_devops_issues/,
    );
    assert.match(markdown, /\*\*Ops follow-up unresolved DevOps issues:\*\* 0/);
    assert.match(markdown, /\*\*Ops follow-up last correction role:\*\* architect/);
    assert.match(markdown, /\*\*Ops follow-up evaluation turn:\*\* 11/);
  });

  it("marks unevaluated runs explicitly in export metadata", () => {
    const markdown = buildRunMarkdown({
      run: buildExportRun({ opsFollowUpEvaluated: undefined }),
    });

    assert.match(markdown, /\*\*Ops follow-up:\*\* not evaluated/);
    assert.doesNotMatch(markdown, /\*\*Ops follow-up evaluated:\*\*/);
  });
});
