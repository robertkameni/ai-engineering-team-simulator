import type { ReviewOpenGap } from "@/ai/artifacts/build-review-open-gaps.types";
import type { OpenGapClaimPattern } from "@/ai/artifacts/validate-artifact-cross-consistency.types";
import { collectArtifactDocumentText } from "@/ai/artifacts/validate-artifact-consistency";
import type { ArtifactType, RunArtifactsOutput } from "@/features/artifacts/schemas";

const CROSS_CHECK_ARTIFACT_TYPES = [
  "architecture",
  "implementation",
] as const satisfies readonly ArtifactType[];

const OPEN_GAP_CLAIM_PATTERNS: readonly OpenGapClaimPattern[] = [
  {
    topicKey: "outbox_claimed_by",
    claimPattern:
      /\bclaimed_by\b|\boutbox\b[^.\n]{0,80}\b(?:heartbeat|reclaim|processed)\b/i,
  },
  {
    topicKey: "per_provider_queues",
    claimPattern:
      /\bper-provider\b|\bSlackQueue\b|\bGoogleQueue\b|\bDocuSignQueue\b/i,
  },
  {
    topicKey: "session_expiry_warning",
    claimPattern:
      /\bsession expiry warning\b|\bexpires in \d+ minutes\b|\buseSessionExpiryWarning\b/i,
  },
  {
    topicKey: "backup_verification",
    claimPattern:
      /\bfull restore verification\b|\btemp_verify\b|\brow count comparison\b/i,
  },
];

const EXPLICIT_OPEN_GAP_LANGUAGE =
  /\b(unresolved|open gap|reviewer flagged|not yet adopted|recommended only|provisional)\b/i;

export function findFalseResolutionViolations(
  documentText: string,
  openGaps: readonly ReviewOpenGap[],
): string[] {
  const violations: string[] = [];
  const openTopicKeys = new Set(openGaps.map((gap) => gap.topicKey));

  for (const { topicKey, claimPattern } of OPEN_GAP_CLAIM_PATTERNS) {
    if (!openTopicKeys.has(topicKey)) {
      continue;
    }

    const match = claimPattern.exec(documentText);
    if (!match) {
      continue;
    }

    const contextStart = Math.max(0, match.index - 120);
    const contextEnd = Math.min(documentText.length, match.index + match[0].length + 120);
    const context = documentText.slice(contextStart, contextEnd);

    if (EXPLICIT_OPEN_GAP_LANGUAGE.test(context)) {
      continue;
    }

    violations.push(
      `claims resolved "${topicKey}" but reviewer marked it UNRESOLVED in the debate`,
    );
  }

  return [...new Set(violations)];
}

export function validateArtifactCrossConsistency(
  output: Partial<RunArtifactsOutput>,
  openGaps: readonly ReviewOpenGap[],
): string[] {
  if (openGaps.length === 0) {
    return [];
  }

  const violations: string[] = [];

  for (const type of CROSS_CHECK_ARTIFACT_TYPES) {
    const document = output[type];
    if (!document) {
      continue;
    }

    const documentText = collectArtifactDocumentText(document);
    const documentViolations = findFalseResolutionViolations(
      documentText,
      openGaps,
    );

    for (const violation of documentViolations) {
      violations.push(`${type}: ${violation}`);
    }
  }

  return violations;
}

export function buildCrossConsistencyFixPrompt(
  violations: readonly string[],
): string {
  return [
    "CRITICAL cross-artifact consistency fix:",
    "The reviewer marked several items as UNRESOLVED in the debate.",
    "Remove any language implying these are implemented, mitigated, or already present.",
    "Describe them only as open gaps, recommendations, or reviewer-flagged unresolved items.",
    ...violations.map((violation) => `- ${violation}`),
  ].join("\n");
}

export function resolveCrossRetryTypes(
  violations: readonly string[],
): ArtifactType[] {
  const retryTypes = new Set<ArtifactType>();

  for (const violation of violations) {
    if (violation.startsWith("architecture:")) {
      retryTypes.add("architecture");
    }
    if (violation.startsWith("implementation:")) {
      retryTypes.add("implementation");
    }
  }

  return CROSS_CHECK_ARTIFACT_TYPES.filter((type) => retryTypes.has(type));
}
