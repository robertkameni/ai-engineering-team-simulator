import type {
  CrossRetryResult,
  RetryCrossInconsistentArtifactsParams,
} from "@/ai/artifacts/generate-run-artifacts.types";
import { regenerateArtifactsForViolations } from "@/ai/artifacts/regenerate-artifacts-for-violations";
import {
  buildCrossConsistencyFixPrompt,
  buildDeterministicCrossConsistencyFixPrompt,
  resolveCrossRetryTypes,
  validateArtifactCrossConsistency,
} from "@/ai/artifacts/validate-artifact-cross-consistency";

export async function retryCrossInconsistentArtifacts(
  params: RetryCrossInconsistentArtifactsParams,
): Promise<CrossRetryResult> {
  const { output, openGaps } = params;

  let violations = validateArtifactCrossConsistency(output, openGaps);
  if (violations.length === 0) {
    return { retryCount: 0, crossValidationFailed: false };
  }

  let retryCount = 0;

  retryCount += await regenerateArtifactsForViolations(
    params,
    resolveCrossRetryTypes(violations),
    buildCrossConsistencyFixPrompt(violations),
  );

  violations = validateArtifactCrossConsistency(output, openGaps);
  if (violations.length === 0) {
    return { retryCount, crossValidationFailed: false };
  }

  retryCount += await regenerateArtifactsForViolations(
    params,
    resolveCrossRetryTypes(violations),
    buildDeterministicCrossConsistencyFixPrompt(violations, openGaps),
  );

  violations = validateArtifactCrossConsistency(output, openGaps);
  if (violations.length > 0) {
    console.warn("Cross-artifact validation failed after retries", { violations });
    return { retryCount, crossValidationFailed: true };
  }

  return { retryCount, crossValidationFailed: false };
}
