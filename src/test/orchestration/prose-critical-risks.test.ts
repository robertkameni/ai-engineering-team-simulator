import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { createSimulationRoster, type TeamRoster } from "@/ai/agents/roster";
import { extractUnresolvedProseCriticalRisks } from "@/ai/orchestration/prose-critical-risks";

function fixedRoster(): TeamRoster {
  const roster = createSimulationRoster("software");
  const names: Record<SimulationAgentRole, string> = {
    pm: "Casey",
    architect: "Jamie",
    backend: "Priya",
    frontend: "Harper",
    devops: "Avery",
    reviewer: "Kai",
  };
  for (const role of SIMULATION_AGENT_ORDER) {
    roster[role] = { ...roster[role], name: names[role] };
  }
  return roster;
}

const FINAL_REVIEW = `## Review of Combined Plans

Prior critiques have been addressed.

## Critical Risks

**Risk 1 — Backup restore untested (data_loss).** Avery asserts a quarterly drill but provides no mechanism: no scheduled job, no named test. **Blast radius:** total data loss on prod volume failure. **Mitigation:** a named scheduled drill. **Acceptance:** drill passes in staging within 30 days.

**Risk 2 — Silent poller stall (silent degradation).** Avery's lag_seconds alert covers this — but only if the poller is alive. **Blast radius:** events never ingested. **Mitigation:** a watchdog that alerts on poller process death. **Acceptance:** alert fires within 5 minutes of poller termination.

**Risk 3 — No auth token refresh interceptor on the client (security).** Harper's frontend plan mentions auth but I need the concrete mechanism. **Blast radius:** dashboard silently fails to load data. **Mitigation:** an interceptor that catches 401, refreshes, and retries. **Acceptance:** a test that simulates token expiry.

## Cross-Critique Compliance

No challenges detected.

## Recommendations

Ship after addressing the two gaps.`;

const RESOLVED_RISK_REVIEW = `## Critical Risks

**1. Auth token leak (security).** The refresh token would be exposed in localStorage. Mitigation: httpOnly cookie — already present in the frontend plan. Resolved.

**2. Backup restore untested (data_loss).** **Unresolved** — no named restore test exists. **Blast radius:** total data loss on prod volume failure.`;

describe("extractUnresolvedProseCriticalRisks", () => {
  it("promotes unresolved critical prose risks from the final review", () => {
    const risks = extractUnresolvedProseCriticalRisks(FINAL_REVIEW, fixedRoster());

    assert.equal(risks.length, 2);
    assert.deepEqual(
      risks.map((risk) => risk.category),
      ["data_loss", "security"],
    );
    assert.deepEqual(
      risks.map((risk) => risk.targetRole),
      ["devops", "frontend"],
    );
    assert.match(risks[0]!.excerpt, /Backup restore untested/);
    assert.match(risks[1]!.excerpt, /auth token refresh/);
  });

  it("promotes must-include and missing-mitigation critical gaps", () => {
    const review = `## Critical Risks

**Risk 1 — Share-link IDOR (security).** The public share token must include an unguessable secret and a revocation path. This is a critical auth gap.

**Risk 2 — Restore drill (data_loss).** Backup restore must include a named staging drill. Mitigation is required before ship.

**Risk 3 — Poller lag (silent degradation).** Workers must include a lag alert.`;

    const risks = extractUnresolvedProseCriticalRisks(review, fixedRoster());

    assert.equal(risks.length, 2);
    assert.deepEqual(
      risks.map((risk) => risk.category),
      ["security", "data_loss"],
    );
    assert.match(risks[0]!.excerpt, /Share-link IDOR/);
    assert.match(risks[1]!.excerpt, /Restore drill/);
  });

  it("skips restore-drill tuning notes marked as not a blocker", () => {
    const review = `## Critical Risks

**Risk 1 — Row-count tolerance (data_loss).** The 0.1% restore-drill tolerance could mask a partial restore. This is a tuning note, not a blocker.

**Risk 2 — Backup restore untested (data_loss).** Unresolved — no named restore test exists.`;

    const risks = extractUnresolvedProseCriticalRisks(review, fixedRoster());

    assert.equal(risks.length, 1);
    assert.match(risks[0]!.excerpt, /Backup restore untested/);
  });

  it("skips risks the reviewer marked resolved", () => {
    const risks = extractUnresolvedProseCriticalRisks(
      RESOLVED_RISK_REVIEW,
      fixedRoster(),
    );

    assert.equal(risks.length, 1);
    assert.equal(risks[0]!.category, "data_loss");
    assert.match(risks[0]!.excerpt, /Backup restore untested/);
  });

  it("returns nothing when the review has no critical risks section", () => {
    assert.deepEqual(
      extractUnresolvedProseCriticalRisks("All gaps closed.\n\n[APPROVE]", fixedRoster()),
      [],
    );
  });
});
