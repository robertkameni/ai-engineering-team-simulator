import type { ArtifactType } from "@/lib/artifact-constants";
import type { RunUsageTotals } from "@/lib/ai/run-usage";
import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";
import type { OpsFollowUpCheckpoint } from "@/lib/db/ops-follow-up-summary";
import type { DebateFinalizationTelemetry } from "@/lib/db/debate-finalization-telemetry";
import type { ArtifactErrorTelemetry } from "@/lib/db/run-summary.types";

/**
 * Shared domain types for UI + lib (arch-review F4).
 * Features must not import these from each other — import from here.
 */

export type AgentRole =
  | "pm"
  | "architect"
  | "frontend"
  | "backend"
  | "reviewer"
  | "devops";

export type RunStatus = "idle" | "running" | "complete" | "failed";

export type ArtifactsPanelStatus =
  | "idle"
  | "pending"
  | "generating"
  | "ready"
  | "unavailable";

export interface DebateProgress {
  readonly completed: number;
  readonly total: number;
  readonly activeRole: AgentRole | null;
}

export interface ArtifactSectionGroup {
  title: string;
  items: string[];
}

/** Artifacts keyed by tab — matches `Artifact` rows in the database. */
export type RunArtifacts = Record<ArtifactType, ArtifactSectionGroup[]>;

/** Subset of tabs persisted while synthesis is still running. */
export type PartialRunArtifacts = Partial<RunArtifacts>;

export interface SimulationMessage {
  id: string;
  role: AgentRole;
  agentName?: string;
  agentTitle?: string;
  content: string;
  quote?: {
    agentName: string;
    text: string;
  };
  isStreaming?: boolean;
  activeTools?: { name: string; args: unknown; }[];
  createdAt: string;
}

export interface MockRun extends Partial<OpsFollowUpCheckpoint> {
  id: string;
  title: string;
  userPrompt: string;
  status: RunStatus;
  updatedAt: string;
  userId?: string | null;
  usage?: RunUsageTotals;
  messages: SimulationMessage[];
  artifacts?: PartialRunArtifacts | null;
  artifactsStatus?: ArtifactsPanelStatus;
  debateOutcome?: DebateExitOutcome | null;
  /** Approved with truncated critical turns — defect edge case after recovery. */
  postApproveTruncation?: boolean;
  truncationRetried?: boolean;
  approvalTier?: "clean" | "accepted_risks" | "forced_close";
  postApproveContinuationFailed?: boolean;
  debateDurationMs?: number | null;
  artifactDurationMs?: number | null;
  userWaitMs?: number | null;
  totalDurationMs?: number | null;
  artifactsPending?: boolean;
  peakPromptTokens?: number | null;
  stackValidationFailed?: boolean;
  crossValidationFailed?: boolean;
  opsFollowUpArchitectCheckpoint?: OpsFollowUpCheckpoint | null;
  /** Deterministic debate finalization telemetry. */
  finalization?: DebateFinalizationTelemetry | null;
  /** Populated when core artifact synthesis fails after debate. */
  artifactError?: ArtifactErrorTelemetry | null;
}

export type { DebateExitOutcome };
