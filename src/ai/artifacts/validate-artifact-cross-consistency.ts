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

const GENERIC_GAP_STOP_WORDS = new Set([
  "reviewer",
  "unresolved",
  "disagree",
  "teammate",
  "teammates",
  "mitigation",
  "exists",
  "prior",
  "message",
  "messages",
  "marked",
  "flagged",
  "blast",
  "radius",
  "significant",
]);

const GENERIC_GAP_CONTEXT_RADIUS = 120;
const GENERIC_GAP_MIN_KEYWORDS = 2;

function extractGenericGapKeywords(excerpt: string): string[] {
  const matches = excerpt.toLowerCase().match(/\b[a-z][a-z0-9_-]{4,}\b/g) ?? [];
  const keywords: string[] = [];

  for (const word of matches) {
    if (GENERIC_GAP_STOP_WORDS.has(word)) {
      continue;
    }
    if (!keywords.includes(word)) {
      keywords.push(word);
    }
    if (keywords.length >= 5) {
      break;
    }
  }

  return keywords;
}

function findGenericFalseResolutionViolations(
  documentText: string,
  openGaps: readonly ReviewOpenGap[],
): string[] {
  const violations: string[] = [];
  const lowerDocumentText = documentText.toLowerCase();

  for (const gap of openGaps) {
    if (gap.topicKey !== "generic") {
      continue;
    }

    const keywords = extractGenericGapKeywords(gap.excerpt);
    if (keywords.length < GENERIC_GAP_MIN_KEYWORDS) {
      continue;
    }

    const matchedKeywords = keywords.filter((keyword) =>
      lowerDocumentText.includes(keyword),
    );
    if (matchedKeywords.length < GENERIC_GAP_MIN_KEYWORDS) {
      continue;
    }

    const firstMatchIndex = matchedKeywords
      .map((keyword) => lowerDocumentText.indexOf(keyword))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];

    if (firstMatchIndex == null) {
      continue;
    }

    const contextStart = Math.max(0, firstMatchIndex - GENERIC_GAP_CONTEXT_RADIUS);
    const contextEnd = Math.min(
      documentText.length,
      firstMatchIndex + GENERIC_GAP_CONTEXT_RADIUS,
    );
    const context = documentText.slice(contextStart, contextEnd);

    if (EXPLICIT_OPEN_GAP_LANGUAGE.test(context)) {
      continue;
    }

    violations.push(
      `claims resolved generic open gap but reviewer marked it unresolved: "${gap.excerpt.slice(0, 80)}"`,
    );
  }

  return violations;
}

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

  violations.push(...findGenericFalseResolutionViolations(documentText, openGaps));

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

export function buildDeterministicCrossConsistencyFixPrompt(
  violations: readonly string[],
  openGaps: readonly ReviewOpenGap[],
): string {
  const gapLines = openGaps.map((gap) => `- ${gap.excerpt}`);

  return [
    buildCrossConsistencyFixPrompt(violations),
    "Unresolved reviewer gaps (never describe as implemented):",
    ...gapLines,
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
