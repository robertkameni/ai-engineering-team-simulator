import {
  buildOpenGapsDirective,
  extractReviewOpenGaps,
} from "@/ai/artifacts/build-review-open-gaps";
import { buildCompressedDebateSummary } from "@/ai/artifacts/compress-debate-summary";
import { buildConsensusDirectives } from "@/ai/artifacts/build-consensus-directives";
import {
  ARTIFACT_SYNTHESIS_ORDER,
  buildArtifactPrompt,
  buildPriorArtifactsPrompt,
  generateArtifactDocument,
} from "@/ai/artifacts/generate-artifact-document";
import type {
  ArtifactTruthfulnessViolationEntry,
  GenerateRunArtifactsResult,
} from "@/ai/artifacts/generate-run-artifacts.types";
import { mergeCorrectionTurns } from "@/ai/artifacts/merge-correction-turns";
import { retryCrossInconsistentArtifacts } from "@/ai/artifacts/retry-cross-inconsistent-artifacts";
import { retryStackInconsistentArtifacts } from "@/ai/artifacts/retry-stack-inconsistent-artifacts";
import {
  validateArtifactTruthfulness,
  type ArtifactTruthfulnessContext,
} from "@/ai/artifacts/validate-artifact-truthfulness";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { assertSimulationWithinBudget } from "@/ai/orchestration/simulation-budget";
import {
  isUnapprovedDebateExitOutcome,
  parseDebateOutcomeFromRunSummary,
} from "@/ai/orchestration/reviewer-decision";
import { CORE_ARTIFACT_TYPES } from "@/features/artifacts/artifact-constants";
import type {
  ArtifactDocument,
  ArtifactType,
  RunArtifactsOutput,
} from "@/features/artifacts/schemas";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

/**
 * Forced sequencing (documented):
 * 1. requirements — alone (no prior artifacts)
 * 2. architecture + implementation — parallel (both consume requirements)
 * 3. blueprint + review — parallel (consume prior wave outputs)
 *
 * Independent generateText calls within a wave use Promise.all.
 * Cross/stack consistency retries remain sequential after the waves.
 */

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
  const artifactPhaseStartedAt = Date.now();
  const templateId = roster.templateId;
  const debateOutcome = parseDebateOutcomeFromRunSummary(runSummary ?? null);
  const mergedTranscript = mergeCorrectionTurns(transcript);
  const openGaps = extractReviewOpenGaps(mergedTranscript, roster);
  const openGapsDirective = buildOpenGapsDirective(openGaps);
  const consensusDirectives = buildConsensusDirectives(mergedTranscript);
  // One compressed summary reused across all generators (Group 6.1).
  // cap_reached / unapproved outcomes still synthesize (Group 6.3).
  const transcriptPrompt = buildCompressedDebateSummary(
    productIdea,
    transcript,
    roster,
  );

  if (usageAccumulator) {
    assertSimulationWithinBudget(usageAccumulator);
  }

  const synthesisOrder = resolveSynthesisOrder(artifactTypes);
  const output: Partial<RunArtifactsOutput> = {};
  const truthfulnessViolations: ArtifactTruthfulnessViolationEntry[] = [];
  const perArtifactDurationMs: Partial<Record<ArtifactType, number>> = {};

  const isUnapproved =
    debateOutcome !== null && isUnapprovedDebateExitOutcome(debateOutcome);
  const truthfulnessContext: ArtifactTruthfulnessContext = {
    isUnapproved,
    hasOpenGaps: openGaps.length > 0,
    isTruncationDegraded: debateOutcome === "degraded_truncated",
  };

  async function synthesizeOne(type: ArtifactType): Promise<void> {
    if (usageAccumulator) {
      assertSimulationWithinBudget(usageAccumulator);
    }

    const startedAt = Date.now();
    const priorArtifactsPrompt = buildPriorArtifactsPrompt(type, output);
    const prompt = buildArtifactPrompt(
      transcriptPrompt,
      consensusDirectives,
      openGapsDirective,
      priorArtifactsPrompt,
    );

    console.info("ARTIFACT SYNTHESIS queue", {
      artifactType: type,
      promptChars: prompt.length,
      promptPreview: prompt.slice(0, 500),
      debateOutcome,
      isUnapproved,
    });

    let document: Awaited<ReturnType<typeof generateArtifactDocument>>;
    try {
      document = await generateArtifactDocument(
        type,
        prompt,
        templateId,
        productIdea,
        usageAccumulator,
        debateOutcome,
      );
    } catch (error) {
      console.error("ARTIFACT SYNTHESIS failed", {
        artifactType: type,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    console.info("ARTIFACT SYNTHESIS ok", {
      artifactType: type,
      durationMs: Date.now() - startedAt,
      sectionCount: document.sections.length,
      failedPlaceholder: document.artifactSynthesisFailed === true,
    });

    const truthfulnessResult = validateArtifactTruthfulness(
      document,
      truthfulnessContext,
    );

    if (!truthfulnessResult.isTruthful) {
      for (const violation of truthfulnessResult.violations) {
        truthfulnessViolations.push({
          artifactType: type,
          message: violation.message,
          sections: violation.sections,
        });
      }

      console.warn(
        "ARTIFACT TRUTHFULNESS GUARD: artifact violated truthfulness constraints",
        {
          artifactType: type,
          violationCount: truthfulnessResult.violations.length,
          isUnapproved,
          hasOpenGaps: truthfulnessContext.hasOpenGaps,
        },
      );
    }

    output[type] = document;
    perArtifactDurationMs[type] = Date.now() - startedAt;
    await onArtifactComplete?.(type, document);
  }

  const wave1 = synthesisOrder.filter((type) => type === "requirements");
  const wave2 = synthesisOrder.filter(
    (type) => type === "architecture" || type === "implementation",
  );
  const wave3 = synthesisOrder.filter(
    (type) => type === "blueprint" || type === "review",
  );

  for (const type of wave1) {
    await synthesizeOne(type);
  }

  if (wave2.length > 0) {
    await Promise.all(wave2.map((type) => synthesizeOne(type)));
  }

  if (wave3.length > 0) {
    await Promise.all(wave3.map((type) => synthesizeOne(type)));
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

  const artifactDurationMs = Date.now() - artifactPhaseStartedAt;
  console.info("ARTIFACT PHASE complete", {
    artifactDurationMs,
    perArtifactDurationMs,
    debateOutcome,
  });

  return {
    artifacts: output,
    consistencyRetries: stackRetryResult.retryCount + crossRetryResult.retryCount,
    stackValidationFailed: stackRetryResult.stackValidationFailed,
    crossValidationFailed: crossRetryResult.crossValidationFailed,
    truthfulnessViolations,
    artifactDurationMs,
  };
}
