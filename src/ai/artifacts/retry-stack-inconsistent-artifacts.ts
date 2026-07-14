import { ARTIFACT_SYNTHESIS_ORDER } from "@/ai/artifacts/generate-artifact-document";
import type {
  RetryStackInconsistentArtifactsParams,
  StackRetryResult,
} from "@/ai/artifacts/generate-run-artifacts.types";
import { regenerateArtifactsForViolations } from "@/ai/artifacts/regenerate-artifacts-for-violations";
import {
  buildDeterministicStackConsistencyFixPrompt,
  buildStackConsistencyFixPrompt,
  validateArtifactStackConsistency,
} from "@/ai/artifacts/validate-artifact-consistency";
import type { ArtifactType } from "@/features/artifacts/schemas";

function resolveStackRetryTypes(violations: readonly string[]): ArtifactType[] {
  const retryTypes = new Set<ArtifactType>();
  for (const violation of violations) {
    if (violation.startsWith("implementation:")) {
      retryTypes.add("implementation");
    }
    if (violation.startsWith("blueprint:")) {
      retryTypes.add("blueprint");
    }
  }
  return ARTIFACT_SYNTHESIS_ORDER.filter((type) => retryTypes.has(type));
}

export async function retryStackInconsistentArtifacts(
  params: RetryStackInconsistentArtifactsParams,
): Promise<StackRetryResult> {
  let violations = validateArtifactStackConsistency(params.output);
  if (violations.length === 0) {
    return { retryCount: 0, stackValidationFailed: false };
  }

  let retryCount = 0;

  retryCount += await regenerateArtifactsForViolations(
    params,
    resolveStackRetryTypes(violations),
    buildStackConsistencyFixPrompt(violations),
  );

  violations = validateArtifactStackConsistency(params.output);
  if (violations.length === 0) {
    return { retryCount, stackValidationFailed: false };
  }

  retryCount += await regenerateArtifactsForViolations(
    params,
    resolveStackRetryTypes(violations),
    buildDeterministicStackConsistencyFixPrompt(violations),
  );

  violations = validateArtifactStackConsistency(params.output);
  if (violations.length > 0) {
    console.warn("Stack validation failed after retries", { violations });
    return { retryCount, stackValidationFailed: true };
  }

  return { retryCount, stackValidationFailed: false };
}
