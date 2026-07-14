import {
  buildOpenGapsDirective,
  extractReviewOpenGaps,
} from "@/ai/artifacts/build-review-open-gaps";
import { buildTranscriptForArtifacts } from "@/ai/artifacts/build-transcript";
import { buildConsensusDirectives } from "@/ai/artifacts/build-consensus-directives";
import {
  ARTIFACT_SYNTHESIS_ORDER,
  buildArtifactPrompt,
  buildPriorArtifactsPrompt,
  generateArtifactDocument,
} from "@/ai/artifacts/generate-artifact-document";
import type { GenerateRunArtifactsResult } from "@/ai/artifacts/generate-run-artifacts.types";
import { mergeCorrectionTurns } from "@/ai/artifacts/merge-correction-turns";
import { retryCrossInconsistentArtifacts } from "@/ai/artifacts/retry-cross-inconsistent-artifacts";
import { retryStackInconsistentArtifacts } from "@/ai/artifacts/retry-stack-inconsistent-artifacts";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { assertSimulationWithinBudget } from "@/ai/orchestration/simulation-budget";
import { parseDebateOutcomeFromRunSummary } from "@/ai/orchestration/reviewer-decision";
import { CORE_ARTIFACT_TYPES } from "@/features/artifacts/artifact-constants";
import type {
  ArtifactDocument,
  ArtifactType,
  RunArtifactsOutput,
} from "@/features/artifacts/schemas";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

function resolveSynthesisOrder(
  artifactTypes: readonly ArtifactType[],
): ArtifactType[] {
  const requested = new Set(artifactTypes);
  return ARTIFACT_SYNTHESIS_ORDER.filter((type) => requested.has(type));
}

export async function generateRunArtifacts({
  productIdea,
  transcript,
  roster,
  onArtifactComplete,
  usageAccumulator,
  runSummary,
  artifactTypes = CORE_ARTIFACT_TYPES,
}: {
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
  onArtifactComplete?: (
    type: ArtifactType,
    document: ArtifactDocument,
  ) => Promise<void> | void;
  usageAccumulator?: RunUsageAccumulator;
  runSummary?: string | null;
  artifactTypes?: readonly ArtifactType[];
}): Promise<GenerateRunArtifactsResult> {
  const templateId = roster.templateId;
  const debateOutcome = parseDebateOutcomeFromRunSummary(runSummary ?? null);
  const mergedTranscript = mergeCorrectionTurns(transcript);
  const openGaps = extractReviewOpenGaps(mergedTranscript, roster);
  const openGapsDirective = buildOpenGapsDirective(openGaps);
  const consensusDirectives = buildConsensusDirectives(mergedTranscript);
  const transcriptPrompt = buildTranscriptForArtifacts(
    productIdea,
    transcript,
    roster,
  );

  if (usageAccumulator) {
    assertSimulationWithinBudget(usageAccumulator);
  }

  const synthesisOrder = resolveSynthesisOrder(artifactTypes);
  const output: Partial<RunArtifactsOutput> = {};

  for (const type of synthesisOrder) {
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
    );

    output[type] = document;
    await onArtifactComplete?.(type, document);
  }

  const retryContext = {
    output,
    transcriptPrompt,
    consensusDirectives,
    openGapsDirective,
    templateId,
    productIdea,
    usageAccumulator,
    debateOutcome: debateOutcome ?? null,
    onArtifactComplete,
  };

  const stackRetryResult = await retryStackInconsistentArtifacts(retryContext);

  const crossRetryResult = await retryCrossInconsistentArtifacts({
    ...retryContext,
    openGaps,
  });

  return {
    artifacts: output,
    consistencyRetries: stackRetryResult.retryCount + crossRetryResult.retryCount,
    stackValidationFailed: stackRetryResult.stackValidationFailed,
    crossValidationFailed: crossRetryResult.crossValidationFailed,
  };
}
