// CORRECTION LOOP FAILURE GUARD
// Validates that a correction turn actually differs meaningfully from the
// original agent output and addresses reviewer concerns.

import type { SimulationAgentRole } from "@/ai/agents/config";

export interface CorrectionValidationResult {
  /** Whether the correction is considered valid enough to route to re-review. */
  isValid: boolean;
  /** Human-readable reason for failure (empty if valid). */
  failureReason: string;
  /** Token overlap ratio between old and new output (0–1). */
  textSimilarity: number;
  /** Whether the correction acknowledges reviewer concerns at all. */
  addressesReviewerFeedback: boolean;
}

interface ReviewerConcern {
  /** A keyword or phrase that captures one reviewer objection. */
  pattern: string;
  /** Whether the correction text references it. */
  addressed: boolean;
}

const SIMILARITY_REJECT_THRESHOLD = 0.78;
const SIMILARITY_WARN_THRESHOLD = 0.60;
const MIN_CORRECTION_CHARS = 120;
const MIN_CORRECTION_DELTA_LINES = 3;

const FUZZY_TOKEN_REGEX = /[\p{L}\p{N}_-]{2,}/gu;

const MANDATORY_RESPONSE_PATTERNS = [
  /\b(?:add(?:ed|ing)?|remov(?:ed?|ing)|replac(?:ed?|ing)|chang(?:ed?|ing)|updat(?:ed?|ing)|revis(?:ed?|ing)|defer(?:red)?|moved?|shift(?:ed)?)\b/i,
];

const GENERIC_ACKNOWLEDGMENT = /\b(?:noted|acknowledged|understood|agreed?|will consider|makes sense)\b/i;

/**
 * Extracts reviewer concerns from rejection feedback text.
 * Parses numbered items, Disagree blocks, and explicit UNRESOLVED markers.
 */
export function extractReviewerConcerns(feedback: string): string[] {
  const concerns: string[] = [];
  const lines = feedback.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 20) {
      continue;
    }

    if (/^\d+\.\s+\*\*/.test(trimmed)) {
      const cleaned = trimmed.replace(/^\d+\.\s+\*\*/, "").replace(/\*\*.*$/g, "").trim();
      if (cleaned.length >= 6) {
        concerns.push(cleaned);
      }
    }

    if (/\*\*Disagree\*\*/i.test(trimmed) || /\*\*Refine\*\*/i.test(trimmed)) {
      const cleaned = trimmed.replace(/\*\*(?:Disagree|Refine)\*\*\s*[:-]?\s*/i, "").trim();
      if (cleaned.length >= 10) {
        concerns.push(cleaned);
      }
    }

    if (/\bUNRESOLVED\b/i.test(trimmed) || /\bmissing\b/i.test(trimmed)) {
      const cleaned = trimmed.replace(/^\s*[-*]\s+/, "").trim();
      if (cleaned.length >= 12 && cleaned.length <= 300) {
        concerns.push(cleaned);
      }
    }
  }

  return [...new Set(concerns)].slice(0, 8);
}

function tokenize(text: string): Set<string> {
  const tokens = text.toLowerCase().match(FUZZY_TOKEN_REGEX) ?? [];
  return new Set(tokens);
}

function computeTokenOverlap(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 && tokensB.size === 0) {
    return 0;
  }
  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

function countMeaningfulLines(text: string): number {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 20 && !line.startsWith("## Changes") && !line.startsWith('"""')).length;
}

function checkConcernAddressed(concern: string, correctionText: string): boolean {
  const lowerConcern = concern.toLowerCase();
  const lowerCorrection = correctionText.toLowerCase();

  const allKeywords = lowerConcern
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 8);

  if (allKeywords.length === 0) {
    return false;
  }

  const matchedCount = allKeywords.filter((kw) => lowerCorrection.includes(kw)).length;

  // For short concerns (<=5 keywords), require 50%+ match.
  // For longer concerns (>5 keywords), require 50%+ match AND at
  // least one of the last 3 keywords (the distinctive part) must match.
  if (allKeywords.length <= 5) {
    const required = Math.max(2, Math.ceil(allKeywords.length * 0.5));
    return matchedCount >= required;
  }

  const distinctiveKeywords = allKeywords.slice(-3);
  const hasDistinctive = distinctiveKeywords.some((kw) => lowerCorrection.includes(kw));
  if (!hasDistinctive) {
    return false;
  }

  const required = Math.max(3, Math.ceil(allKeywords.length * 0.5));
  return matchedCount >= required;
}

function hasSubstantiveChanges(text: string): boolean {
  return MANDATORY_RESPONSE_PATTERNS.some((pattern) => pattern.test(text))
    && !GENERIC_ACKNOWLEDGMENT.test(text.slice(0, 200));
}

/**
 * Validates a correction turn against the previous turn from the same role
 * and the reviewer's rejection feedback.
 *
 * Returns a structured result indicating whether the correction should
 * proceed to re-review or be treated as a failed correction.
 *
 * CORRECTION LOOP FAILURE GUARD
 */
export function validateCorrectionTurn(
  previousContent: string,
  correctionContent: string,
  reviewerFeedback: string,
  role: SimulationAgentRole,
): CorrectionValidationResult {
  const similarity = computeTokenOverlap(previousContent, correctionContent);

  if (correctionContent.trim().length < MIN_CORRECTION_CHARS) {
    return {
      isValid: false,
      failureReason: `Correction turn too short (${correctionContent.trim().length} chars, min ${MIN_CORRECTION_CHARS})`,
      textSimilarity: similarity,
      addressesReviewerFeedback: false,
    };
  }

  if (similarity > SIMILARITY_REJECT_THRESHOLD) {
    return {
      isValid: false,
      failureReason: `Correction turn too similar to original (${(similarity * 100).toFixed(0)}% token overlap, threshold ${(SIMILARITY_REJECT_THRESHOLD * 100).toFixed(0)}%)`,
      textSimilarity: similarity,
      addressesReviewerFeedback: false,
    };
  }

  const prevLines = countMeaningfulLines(previousContent);
  const corrLines = countMeaningfulLines(correctionContent);
  if (corrLines < MIN_CORRECTION_DELTA_LINES && prevLines > 8) {
    return {
      isValid: false,
      failureReason: `Correction turn too sparse (${corrLines} meaningful lines vs ${prevLines} in original, min ${MIN_CORRECTION_DELTA_LINES})`,
      textSimilarity: similarity,
      addressesReviewerFeedback: false,
    };
  }

  const concerns = extractReviewerConcerns(reviewerFeedback);
  let addressedCount = 0;

  for (const concern of concerns) {
    if (checkConcernAddressed(concern, correctionContent)) {
      addressedCount += 1;
    }
  }

  const addressesFeedback = addressedCount > 0;
  const hasSubstantive = hasSubstantiveChanges(correctionContent);

  if (similarity > SIMILARITY_WARN_THRESHOLD && !addressesFeedback) {
    return {
      isValid: false,
      failureReason: `Correction too similar (${(similarity * 100).toFixed(0)}% overlap) AND does not address any extracted reviewer concern`,
      textSimilarity: similarity,
      addressesReviewerFeedback: false,
    };
  }

  if (!hasSubstantive && similarity > 0.50) {
    return {
      isValid: false,
      failureReason: "Correction lacks substantive change language (add/remove/replace/change/update) while being substantially similar to original",
      textSimilarity: similarity,
      addressesReviewerFeedback: addressesFeedback,
    };
  }

  return {
    isValid: true,
    failureReason: "",
    textSimilarity: similarity,
    addressesReviewerFeedback: addressesFeedback,
  };
}
