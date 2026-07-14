import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSimulationRoster } from "@/ai/agents/roster";
import {
  inferIssueOwnerFromConcern,
  inferIssueSeverity,
  isDevOpsOwnedConcern,
  matchesOperationalCategory,
} from "@/ai/orchestration/issue-ownership";

describe("issue ownership inference", () => {
  it("assigns explicit role tags from reviewer feedback", () => {
    const roster = createSimulationRoster("software");
    const owner = inferIssueOwnerFromConcern(
      "**devops**: Add monthly restore CI workflow with pg_restore verification.",
      roster,
      "architect",
    );

    assert.equal(owner, "devops");
  });

  it("assigns ownership by teammate name mention", () => {
    const roster = createSimulationRoster("software");
    const owner = inferIssueOwnerFromConcern(
      `${roster.devops.name}'s health check does not include dead letter growth alert. **UNRESOLVED.**`,
      roster,
      "architect",
    );

    assert.equal(owner, "devops");
    assert.equal(isDevOpsOwnedConcern(
      `${roster.devops.name}'s health check does not include dead letter growth alert.`,
      roster,
      "architect",
    ), true);
  });

  it("routes operational UNRESOLVED gaps to devops when no other owner is named", () => {
    const roster = createSimulationRoster("software");
    const concern =
      "**UNRESOLVED** Monthly backup restore workflow is missing from the deployment plan.";
    const owner = inferIssueOwnerFromConcern(concern, roster, "architect");

    assert.equal(matchesOperationalCategory(concern), true);
    assert.equal(owner, "devops");
  });

  it("keeps backend implementation concerns on backend", () => {
    const roster = createSimulationRoster("software");
    const concern =
      "**UNRESOLVED** The outbox poller can return stale reads when claimed_by is not reset after worker crash.";
    const owner = inferIssueOwnerFromConcern(concern, roster, "architect");

    assert.equal(owner, "backend");
  });

  it("infers blocker severity from UNRESOLVED markers", () => {
    assert.equal(inferIssueSeverity("**UNRESOLVED** restore workflow missing"), "blocker");
    assert.equal(inferIssueSeverity("**Refine** pagination contract"), "concern");
  });
});
