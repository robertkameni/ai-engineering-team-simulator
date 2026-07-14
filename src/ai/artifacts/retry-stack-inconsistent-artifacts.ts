import {
  ARTIFACT_SYNTHESIS_ORDER,
  buildArtifactPrompt,
  buildPriorArtifactsPrompt,
  generateArtifactDocument,
} from "@/ai/artifacts/generate-artifact-document";
import type {
  RetryStackInconsistentArtifactsParams,
  StackRetryResult,
} from "@/ai/artifacts/generate-run-artifacts.types";
import {
  buildDeterministicStackConsistencyFixPrompt,
  buildStackConsistencyFixPrompt,
  validateArtifactStackConsistency,
} from "@/ai/artifacts/validate-artifact-consistency";
import { assertSimulationWithinBudget } from "@/ai/orchestration/simulation-budget";
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

async function regenerateStackArtifactsForViolations(
  params: RetryStackInconsistentArtifactsParams,
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

export async function retryStackInconsistentArtifacts(
  params: RetryStackInconsistentArtifactsParams,
): Promise<StackRetryResult> {
  let violations = validateArtifactStackConsistency(params.output);
  if (violations.length === 0) {
    return { retryCount: 0, stackValidationFailed: false };
  }

  let retryCount = 0;

  retryCount += await regenerateStackArtifactsForViolations(
    params,
    resolveStackRetryTypes(violations),
    buildStackConsistencyFixPrompt(violations),
  );

  violations = validateArtifactStackConsistency(params.output);
  if (violations.length === 0) {
    return { retryCount, stackValidationFailed: false };
  }

  retryCount += await regenerateStackArtifactsForViolations(
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
