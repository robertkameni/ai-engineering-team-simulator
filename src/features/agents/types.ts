import type {
  ArtifactsPanelStatus,
  PartialRunArtifacts,
} from "@/features/artifacts/types";
import type { RunUsageTotals } from "@/lib/ai/run-usage";
import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";

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
  activeTools?: { name: string; args: unknown }[];
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
