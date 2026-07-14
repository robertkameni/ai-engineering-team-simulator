import {
  buildArtifactPrompt,
  buildPriorArtifactsPrompt,
  generateArtifactDocument,
} from "@/ai/artifacts/generate-artifact-document";
import type { ArtifactSynthesisRetryContext } from "@/ai/artifacts/generate-run-artifacts.types";
import { assertSimulationWithinBudget } from "@/ai/orchestration/simulation-budget";
import type { ArtifactType } from "@/features/artifacts/schemas";

export async function regenerateArtifactsForViolations(
  params: ArtifactSynthesisRetryContext,
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
