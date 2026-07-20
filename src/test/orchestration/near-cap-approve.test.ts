import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSimulationRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  forcedApproveNearCap,
  shouldPreferNearCapApprove,
} from "@/ai/orchestration/role-participation";
import {
  isWorthlessContinuation,
  sanitizeMergedContinuation,
} from "@/ai/orchestration/looks-like-truncated-agent-output";

function fullParticipationTranscript(): TranscriptEntry[] {
  return [
    { role: "pm", agentName: "Pat", content: "Scope" },
    { role: "architect", agentName: "Skyler", content: "Architecture" },
    { role: "backend", agentName: "Kai", content: "API" },
    { role: "frontend", agentName: "Dana", content: "UI" },
    { role: "devops", agentName: "Omar", content: "Ops" },
  ];
}

describe("near-cap approve and meta-spam guards", () => {
  it("forcedApproveNearCap matches shouldPreferNearCapApprove", () => {
    const params = {
      transcript: fullParticipationTranscript(),
      turnCount: 19,
      maxTurns: 20,
      openIssueCount: 1,
      unresolvedOpsIssueCount: 0,
    };

    assert.equal(shouldPreferNearCapApprove(params), true);
    assert.equal(forcedApproveNearCap(params), true);
  });

  it("blocks near-cap approve while unresolved ops issues remain", () => {
    assert.equal(
      shouldPreferNearCapApprove({
        transcript: fullParticipationTranscript(),
        turnCount: 19,
        maxTurns: 20,
        openIssueCount: 1,
        unresolvedOpsIssueCount: 2,
      }),
      false,
    );
  });

  it("treats duplicate APPROVE / no-continuation meta as worthless", () => {
    assert.equal(isWorthlessContinuation("[APPROVE]"), true);
    assert.equal(
      isWorthlessContinuation("no continuation needed\n\n[APPROVE]"),
      true,
    );
  });

  it("collapses duplicate trailing APPROVE tags on merge", () => {
    const merged = sanitizeMergedContinuation(
      "Looks good.\n\n[APPROVE]\n\nno continuation needed\n\n[APPROVE]",
    );
    assert.equal((merged.match(/\[APPROVE\]/gi) ?? []).length, 1);
    assert.equal(/no continuation needed/i.test(merged), false);
  });
});

describe("roster fixture sanity", () => {
  it("builds a software roster for near-cap tests", () => {
    const roster = createSimulationRoster("software");
    assert.ok(roster.devops.name.length > 0);
  });
});
