import type { ReviewOpenGap } from "@/ai/artifacts/build-review-open-gaps.types";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";
import type {
  ArtifactDocument,
  ArtifactType,
  RunArtifactsOutput,
} from "@/features/artifacts/schemas";
import type { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

export interface GenerateRunArtifactsResult {
  readonly artifacts: Partial<RunArtifactsOutput>;
  readonly consistencyRetries: number;
  readonly stackValidationFailed: boolean;
}

export interface StackRetryResult {
  readonly retryCount: number;
  readonly stackValidationFailed: boolean;
}

export interface ArtifactSynthesisRetryContext {
  readonly output: Partial<RunArtifactsOutput>;
  readonly transcriptPrompt: string;
  readonly consensusDirectives: string;
  readonly openGapsDirective: string;
  readonly templateId: TeamTemplateId;
  readonly productIdea: string;
  readonly usageAccumulator?: RunUsageAccumulator;
  readonly debateOutcome: DebateExitOutcome | null;
  readonly onArtifactComplete?: (
    type: ArtifactType,
    document: ArtifactDocument,
  ) => Promise<void> | void;
}

export interface RetryStackInconsistentArtifactsParams
  extends ArtifactSynthesisRetryContext {}

export interface RetryCrossInconsistentArtifactsParams
  extends ArtifactSynthesisRetryContext {
  readonly openGaps: readonly ReviewOpenGap[];
}
