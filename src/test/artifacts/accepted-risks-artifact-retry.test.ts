import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAcceptedRisksDirective,
  partitionOpenGapsByAcceptedRisks,
} from "@/ai/artifacts/accepted-risks-for-artifacts";
import type { ReviewOpenGap } from "@/ai/artifacts/build-review-open-gaps.types";
import type { AcceptedCriticalRisk } from "@/ai/orchestration/debate-convergence-controller";

const acceptedRisks: AcceptedCriticalRisk[] = [
  {
    issueId: "ri_1",
    targetRole: "backend",
    category: "security",
    excerpt: "Session token refresh gap remains UNRESOLVED",
    acceptedOnTurn: 9,
  },
  {
    issueId: "ri_2",
    targetRole: "devops",
    category: "data_loss",
    excerpt: "Backup restore procedure is missing and untested",
    acceptedOnTurn: 9,
  },
  {
    issueId: "ri_3",
    targetRole: "frontend",
    category: "security",
    excerpt: "Auth interceptor does not rotate refresh tokens",
    acceptedOnTurn: 9,
  },
];

describe("accepted risks artifact contract", () => {
  it("documents accepted risks and excludes them from actionable retry gaps", () => {
    const openGaps: ReviewOpenGap[] = [
      {
        topicKey: "session_expiry_warning",
        excerpt: "Session token refresh gap remains UNRESOLVED",
        ownerRole: "backend",
      },
      {
        topicKey: "backup_verification",
        excerpt: "Backup restore procedure is missing and untested",
        ownerRole: "devops",
      },
      {
        topicKey: "generic",
        excerpt: "CDN cache invalidation strategy is inconsistent across regions",
        ownerRole: "devops",
      },
    ];

    const partitioned = partitionOpenGapsByAcceptedRisks(openGaps, acceptedRisks);
    assert.equal(partitioned.acceptedGaps.length, 2);
    assert.equal(partitioned.actionableGaps.length, 1);
    assert.match(
      partitioned.actionableGaps[0]!.excerpt,
      /CDN cache invalidation/,
    );

    const directive = buildAcceptedRisksDirective(acceptedRisks);
    assert.match(directive, /ACCEPTED \(not resolved\)/);
    assert.match(directive, /Do NOT trigger a consistency retry/);
    assert.match(directive, /ri_1/);
  });

  it("keeps true inconsistencies actionable when not in accepted list", () => {
    const openGaps: ReviewOpenGap[] = [
      {
        topicKey: "outbox_claimed_by",
        excerpt: "Outbox worker lacks dead-letter handling for permanent failures",
        ownerRole: "backend",
      },
    ];

    const partitioned = partitionOpenGapsByAcceptedRisks(openGaps, acceptedRisks);
    assert.equal(partitioned.acceptedGaps.length, 0);
    assert.equal(partitioned.actionableGaps.length, 1);
  });
});
