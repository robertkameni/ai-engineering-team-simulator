import {
  ARTIFACT_SYNTHESIS_ORDER,
  buildArtifactPrompt,
  buildPriorArtifactsPrompt,
  generateArtifactDocument,
} from "@/ai/artifacts/generate-artifact-document";
import type {
  CrossRetryResult,
  RetryCrossInconsistentArtifactsParams,
} from "@/ai/artifacts/generate-run-artifacts.types";
import {
  buildCrossConsistencyFixPrompt,
  buildDeterministicCrossConsistencyFixPrompt,
  resolveCrossRetryTypes,
  validateArtifactCrossConsistency,
} from "@/ai/artifacts/validate-artifact-cross-consistency";
import { assertSimulationWithinBudget } from "@/ai/orchestration/simulation-budget";
import type { ArtifactType } from "@/features/artifacts/schemas";

async function regenerateCrossArtifactsForViolations(
  params: RetryCrossInconsistentArtifactsParams,
  retryTypes: readonly ArtifactType[],
  fixNotice: string,
): Promise<number> {
  const {
    output,
    transcriptPrompt,
    consensusDirectives,
    openGapsDirective,
    templateId,
    productIdea,
    usageAccumulator,
    debateOutcome,
    onArtifactComplete,
  } = params;

  for (const type of retryTypes) {
    if (usageAccumulator) {
      assertSimulationWithinBudget(usageAccumulator);
    }

    const priorArtifactsPrompt = buildPriorArtifactsPrompt(type, output);
    const prompt = buildArtifactPrompt(
      transcriptPrompt,
      consensusDirectives,
      openGapsDirective,
      priorArtifactsPrompt,
    );

    const document = await generateArtifactDocument(
      type,
      prompt,
      templateId,
      productIdea,
      usageAccumulator,
      debateOutcome,
      fixNotice,
    );

    output[type] = document;
    await onArtifactComplete?.(type, document);
  }

  return retryTypes.length;
}

export async function retryCrossInconsistentArtifacts(
  params: RetryCrossInconsistentArtifactsParams,
): Promise<CrossRetryResult> {
  const { output, openGaps } = params;

  let violations = validateArtifactCrossConsistency(output, openGaps);
  if (violations.length === 0) {
    return { retryCount: 0, crossValidationFailed: false };
  }

  let retryCount = 0;

  retryCount += await regenerateCrossArtifactsForViolations(
    params,
    resolveCrossRetryTypes(violations),
    buildCrossConsistencyFixPrompt(violations),
  );

  violations = validateArtifactCrossConsistency(output, openGaps);
  if (violations.length === 0) {
    return { retryCount, crossValidationFailed: false };
  }

  retryCount += await regenerateCrossArtifactsForViolations(
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
