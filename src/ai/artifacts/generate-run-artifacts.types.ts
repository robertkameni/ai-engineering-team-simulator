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
}

export interface RetryStackInconsistentArtifactsParams {
  readonly output: Partial<RunArtifactsOutput>;
  readonly transcriptPrompt: string;
  readonly consensusDirectives: string;
  readonly templateId: TeamTemplateId;
  readonly productIdea: string;
  readonly usageAccumulator?: RunUsageAccumulator;
  readonly debateOutcome: DebateExitOutcome | null;
  readonly onArtifactComplete?: (
    type: ArtifactType,
    document: ArtifactDocument,
  ) => Promise<void> | void;
}
