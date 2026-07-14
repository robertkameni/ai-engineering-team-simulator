// ARTIFACT TRUTHFULNESS GUARD
// STATE CONSISTENCY POST-CHECK
//
// Post-generation validation that ensures generated artifacts honestly
// reflect the debate outcome and open gaps. When the run is unapproved
// or has unresolved reviewer gaps, the artifact must carry clear
// provisional markers and must not misrepresent unresolved state as
// finalized or implemented.

import type { ArtifactDocument, ArtifactType } from "@/features/artifacts/schemas";

export interface ArtifactTruthfulnessViolation {
  /** Human-readable description of the violation. */
  message: string;
  /** Which section title(s) the violation targets (empty if document-wide). */
  sections: string[];
}

export interface ArtifactTruthfulnessResult {
  /** Whether the artifact passes all truthfulness checks. */
  isTruthful: boolean;
  /** Individual violations found. */
  violations: ArtifactTruthfulnessViolation[];
}

const PROVISIONAL_MARKERS = [
  /provisiona[l](?:ly)?/i,
  /\bunapproved\b/i,
  /\btentative\b/i,
  /\bdraft\b/i,
  /\bdegraded\b/i,
  /\bnot finalized\b/i,
  /\bpending review\b/i,
  /\bsubject to change\b/i,
  /\bpreliminary\b/i,
];

const OPEN_GAP_MARKERS = [
  /\bopen gap\b/i,
  /\bunresolved\b/i,
  /\breviewer flagged\b/i,
  /\brecommended\b/i,
  /\bproposed\b/i,
  /\bnot yet (?:implemented|resolved|addressed|decided)\b/i,
  /\boutstanding\b/i,
];

const OVERSTATED_FINALITY_PATTERNS = [
  /\b(?:fully )?resolved\b/i,
  /\bfinalized\b/i,
  /\bapproved\b/i,
  /\bcompleted\b/i,
  /\bsettled\b/i,
  /\bdefinitive\b/i,
  /\bconclusive\b/i,
  /\bconfirmed\b/i,
  /\bdelivered\b/i,
  /\bshipped\b/i,
];

const MIN_ARTIFACT_TEXT_LENGTH = 80;

function collectArtifactText(document: ArtifactDocument): string {
  return document.sections
    .flatMap((section) => [section.title, ...section.items])
    .join(" ");
}

function collectSectionText(document: ArtifactDocument): { title: string; text: string }[] {
  return document.sections.map((section) => ({
    title: section.title,
    text: [section.title, ...section.items].join(" "),
  }));
}

// ---- Check A: Missing provisional markers for unapproved runs ----

/**
 * When the debate was unapproved / cap_reached / truncated-degraded,
 * the artifact must signal its provisional nature.  Checks every
 * section text for at least one provisional marker.
 *
 * ARTIFACT TRUTHFULNESS GUARD
 */
export function checkMissingProvisionalMarkers(
  document: ArtifactDocument,
): ArtifactTruthfulnessViolation[] {
  const sectionTexts = collectSectionText(document);
  const violations: ArtifactTruthfulnessViolation[] = [];

  for (const { title, text } of sectionTexts) {
    if (text.length < MIN_ARTIFACT_TEXT_LENGTH) {
      continue;
    }

    const hasProvisionalMarker = PROVISIONAL_MARKERS.some((pattern) =>
      pattern.test(text),
    );

    if (!hasProvisionalMarker) {
      violations.push({
        message: `Section "${title}" lacks a provisional/unapproved marker — the run was not approved and deliverables must be marked as provisional`,
        sections: [title],
      });
    }
  }

  // Document-level check: at least one section must mention the status
  const fullText = collectArtifactText(document);
  const anyProvisional = PROVISIONAL_MARKERS.some((pattern) =>
    pattern.test(fullText),
  );

  if (!anyProvisional && fullText.length >= MIN_ARTIFACT_TEXT_LENGTH) {
    violations.push({
      message: "Entire artifact lacks any provisional/unapproved status indicator — run was not approved",
      sections: [],
    });
  }

  return violations;
}

// ---- Check B: Missing open-gap acknowledgement ----

/**
 * When the debate left reviewer gaps open, the artifact must surface
 * those as unresolved/recommended items and not silently close them.
 *
 * STATE CONSISTENCY POST-CHECK
 */
export function checkMissingOpenGapAcknowledgement(
  document: ArtifactDocument,
  hasOpenGaps: boolean,
): ArtifactTruthfulnessViolation[] {
  if (!hasOpenGaps) {
    return [];
  }

  const fullText = collectArtifactText(document);

  if (fullText.length < MIN_ARTIFACT_TEXT_LENGTH) {
    return [];
  }

  const hasOpenGapMarker = OPEN_GAP_MARKERS.some((pattern) =>
    pattern.test(fullText),
  );

  if (!hasOpenGapMarker) {
    return [
      {
        message: "Reviewer open gaps exist but the artifact does not acknowledge any unresolved, recommended, or proposed items",
        sections: [],
      },
    ];
  }

  return [];
}

// ---- Check C: Overstated finality for unapproved runs ----

/**
 * When the debate was unapproved, the artifact must not use final/
 * resolved/approved language that implies the run is closed and
 * decisions are settled.
 *
 * Overstated-finality sentences are flagged but the check is
 * threshold-based: more than N finality-sounding items across the
 * document without counterbalancing provisional markers is a violation.
 *
 * ARTIFACT TRUTHFULNESS GUARD
 */
const OVERSTATED_FINALITY_THRESHOLD = 3;

export function checkOverstatedFinality(
  document: ArtifactDocument,
): ArtifactTruthfulnessViolation[] {
  const fullText = collectArtifactText(document);

  if (fullText.length < MIN_ARTIFACT_TEXT_LENGTH) {
    return [];
  }

  // Count finality hits across the document
  let finalityCount = 0;

  for (const pattern of OVERSTATED_FINALITY_PATTERNS) {
    const matches = fullText.match(new RegExp(pattern.source, "gi"));
    if (matches) {
      finalityCount += matches.length;
    }
  }

  if (finalityCount < OVERSTATED_FINALITY_THRESHOLD) {
    return [];
  }

  // Check if there are counterbalancing caution markers
  const hasCaution = PROVISIONAL_MARKERS.some((pattern) =>
    pattern.test(fullText),
  );

  if (hasCaution) {
    return [];
  }

  // Collect specific sections with finality issues
  const sectionTexts = collectSectionText(document);
  const affectedSections: string[] = [];

  for (const { title, text } of sectionTexts) {
    for (const pattern of OVERSTATED_FINALITY_PATTERNS) {
      if (pattern.test(text) && !affectedSections.includes(title)) {
        affectedSections.push(title);
        break;
      }
    }
  }

  return [
    {
      message: `Artifact uses overly final language (${finalityCount} finality-pattern hits) without counterbalancing provisional markers — run was not approved`,
      sections: affectedSections.slice(0, 4),
    },
  ];
}

// ---- Composite validation ----

export interface ArtifactTruthfulnessContext {
  /** Whether the run's debate outcome is unapproved (cap_reached, reviewer_error, etc.). */
  isUnapproved: boolean;
  /** Whether the debate left open reviewer gaps. */
  hasOpenGaps: boolean;
  /** Whether a critical-role turn was truncated (degraded_truncated). */
  isTruncationDegraded: boolean;
}

/**
 * Runs all truthfulness checks against a generated artifact document.
 * Returns violations if the artifact misrepresents the debate state.
 *
 * ARTIFACT TRUTHFULNESS GUARD
 * STATE CONSISTENCY POST-CHECK
 */
export function validateArtifactTruthfulness(
  document: ArtifactDocument,
  context: ArtifactTruthfulnessContext,
): ArtifactTruthfulnessResult {
  const violations: ArtifactTruthfulnessViolation[] = [];

  // Check A: missing provisional markers (only for unapproved runs)
  if (context.isUnapproved) {
    violations.push(...checkMissingProvisionalMarkers(document));
  }

  // Check B: missing open-gap acknowledgement
  if (context.hasOpenGaps) {
    violations.push(
      ...checkMissingOpenGapAcknowledgement(document, context.hasOpenGaps),
    );
  }

  // Check C: overstated finality (only for unapproved runs)
  if (context.isUnapproved) {
    violations.push(...checkOverstatedFinality(document));
  }

  return {
    isTruthful: violations.length === 0,
    violations,
  };
}
