import type { ReviewOpenGap } from "@/ai/artifacts/build-review-open-gaps.types";
import type { AcceptedCriticalRisk } from "@/ai/orchestration/debate-convergence-controller";
import { parseRunSummary } from "@/lib/db/run-summary";

function normalizeMatchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function extractAcceptedCriticalRisksFromSummary(
  runSummary: string | null | undefined,
): readonly AcceptedCriticalRisk[] {
  const parsed = parseRunSummary(runSummary ?? null);
  return parsed?.finalization?.acceptedCriticalRisks ?? [];
}

export function buildAcceptedRisksDirective(
  acceptedRisks: readonly AcceptedCriticalRisk[],
): string {
  if (acceptedRisks.length === 0) {
    return "";
  }

  const lines = acceptedRisks.map((risk) => {
    return `- ${risk.issueId} (${risk.category}, owner: ${risk.targetRole}): ${risk.excerpt}`;
  });

  return [
    "## Accepted critical risks (document — do NOT resolve)",
    "",
    "The following critical risks were ACCEPTED (not resolved) by the team during debate finalization.",
    "Document each risk in the relevant artifact (typically review, and architecture/implementation when owned there).",
    "Do NOT attempt to resolve them. Do NOT trigger a consistency retry because of them.",
    "Treat them as documented known-issues in the deliverable, not as defects to fix.",
    "",
    ...lines,
    "",
  ].join("\n");
}

export function partitionOpenGapsByAcceptedRisks(
  openGaps: readonly ReviewOpenGap[],
  acceptedRisks: readonly AcceptedCriticalRisk[],
): {
  readonly actionableGaps: ReviewOpenGap[];
  readonly acceptedGaps: ReviewOpenGap[];
} {
  if (acceptedRisks.length === 0) {
    return { actionableGaps: [...openGaps], acceptedGaps: [] };
  }

  const acceptedExcerpts = acceptedRisks.map((risk) =>
    normalizeMatchText(risk.excerpt),
  );
  const acceptedIssueIds = new Set(
    acceptedRisks.map((risk) => risk.issueId.toLowerCase()),
  );

  const actionableGaps: ReviewOpenGap[] = [];
  const acceptedGaps: ReviewOpenGap[] = [];

  for (const gap of openGaps) {
    const excerpt = normalizeMatchText(gap.excerpt);
    const matchesAccepted =
      acceptedIssueIds.has(excerpt) ||
      acceptedExcerpts.some(
        (accepted) =>
          excerpt.includes(accepted.slice(0, Math.min(80, accepted.length))) ||
          accepted.includes(excerpt.slice(0, Math.min(80, excerpt.length))),
      );

    if (matchesAccepted) {
      acceptedGaps.push(gap);
    } else {
      actionableGaps.push(gap);
    }
  }

  return { actionableGaps, acceptedGaps };
}
