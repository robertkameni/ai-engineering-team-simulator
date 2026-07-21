import {
  markIssuesAcceptedRisk,
  markIssuesAddressed,
  type ReviewIssue,
} from "@/ai/orchestration/review-issue-tracker";

export interface OpsIssueDispositionResolution {
  readonly addressedCount: number;
  readonly acceptedRiskCount: number;
}

const ACCEPTED_RISK_MARKER = /\baccepted[_\s-]?risk\b/i;

function isSubstantiveOpsClosureResponse(devopsResponse: string): boolean {
  const normalized = devopsResponse.trim();
  if (normalized.length < 80) {
    return false;
  }

  const hasClosureHeading = /operational closure|closure/i.test(normalized);
  const bulletCount = normalized
    .split("\n")
    .filter((line) => /^[-*]\s+/.test(line)).length;
  const hasImplementationEvidence =
    /implemented|validated|acceptance criteria|resolved|mitigation/i.test(
      normalized,
    );

  return (hasClosureHeading && bulletCount >= 2) || hasImplementationEvidence;
}

function parseAcceptedRiskReason(devopsResponse: string): string | null {
  const markerIndex = devopsResponse.search(ACCEPTED_RISK_MARKER);
  if (markerIndex < 0) {
    return null;
  }

  const tail = devopsResponse.slice(markerIndex);
  const reasonMatch = tail.match(
    /accepted[_\s-]?risk\s*[:\-]\s*([\s\S]+)$/i,
  );
  const reason = reasonMatch?.[1]?.trim() ?? "";
  if (reason.length === 0) {
    throw new Error("Accepted-risk disposition requires an explicit reason.");
  }
  return reason;
}

export function resolveOpsIssueDispositions(
  issues: ReviewIssue[],
  devopsResponse: string,
  turnCount: number,
): OpsIssueDispositionResolution {
  const openDevOpsIssues = issues.filter(
    (issue) => issue.targetRole === "devops" && issue.status === "open",
  );
  if (openDevOpsIssues.length === 0) {
    return { addressedCount: 0, acceptedRiskCount: 0 };
  }

  for (const issue of openDevOpsIssues) {
    issue.lastAttemptedOnTurn = turnCount;
  }

  const acceptedRiskReason = parseAcceptedRiskReason(devopsResponse);
  if (acceptedRiskReason !== null) {
    markIssuesAcceptedRisk(openDevOpsIssues, {
      reason: acceptedRiskReason,
      acceptedByRole: "devops",
      acceptedOnTurn: turnCount,
      metadata: { source: "ops_follow_up_closure" },
    });
    return { addressedCount: 0, acceptedRiskCount: openDevOpsIssues.length };
  }

  if (!isSubstantiveOpsClosureResponse(devopsResponse)) {
    return { addressedCount: 0, acceptedRiskCount: 0 };
  }

  markIssuesAddressed(openDevOpsIssues);
  return { addressedCount: openDevOpsIssues.length, acceptedRiskCount: 0 };
}
