import type {
  ArtifactsPanelStatus,
  PartialRunArtifacts,
} from "@/features/artifacts/types";
import type { RunUsageTotals } from "@/lib/ai/run-usage";
import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";
import type {
  OpsFollowUpCheckpoint,
  OpsFollowUpLastCorrectionRole,
} from "@/lib/db/ops-follow-up-summary";
import type { DebateFinalizationTelemetry } from "@/lib/db/debate-finalization-telemetry";

export type { DebateExitOutcome };

export type AgentRole =
  | "pm"
  | "architect"
  | "frontend"
  | "backend"
  | "reviewer"
  | "devops";

export type RunStatus = "idle" | "running" | "complete" | "failed";

export interface AgentPersonaBase {
  role: AgentRole;
  name: string;
  title: string;
  initials: string;
}

export interface AgentPersona extends AgentPersonaBase {
  accentClass: string;
  borderClass: string;
  badgeClass: string;
}

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

export interface MockRun {
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
  opsFollowUpEvaluated?: boolean;
  opsFollowUpTriggered?: boolean;
  opsFollowUpSkipReason?: string | null;
  opsFollowUpEligible?: boolean;
  opsFollowUpUnresolvedDevopsIssueCount?: number;
  opsFollowUpOpenIssueCount?: number;
  opsFollowUpAddressedIssueCount?: number;
  opsFollowUpAcceptedRiskIssueCount?: number;
  opsFollowUpAcceptedRiskReasons?: readonly string[];
  opsFollowUpLastCorrectionRole?: OpsFollowUpLastCorrectionRole | null;
  opsFollowUpEvaluationTurn?: number | null;
  opsFollowUpArchitectCheckpoint?: OpsFollowUpCheckpoint | null;
  /** Deterministic debate finalization telemetry. */
  finalization?: DebateFinalizationTelemetry | null;
  /** Populated when core artifact synthesis fails after debate. */
  artifactError?: {
    readonly message: string;
    readonly failedArtifact: string | null;
    readonly timestamp: string;
    readonly retryFailed: boolean;
    readonly errorCode?: string;
  } | null;
}

export interface MockArtifactSection {
  title: string;
  items: string[];
}

export interface MockArtifacts {
  requirements: MockArtifactSection[];
  architecture: MockArtifactSection[];
  review: MockArtifactSection[];
}
