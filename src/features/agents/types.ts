export type AgentRole =
  | "pm"
  | "architect"
  | "frontend"
  | "backend"
  | "reviewer"
  | "devops";

export type RunStatus = "idle" | "running" | "complete" | "failed";

export interface AgentPersona {
  role: AgentRole;
  name: string;
  title: string;
  initials: string;
  accentClass: string;
  borderClass: string;
}

export interface SimulationMessage {
  id: string;
  role: AgentRole;
  content: string;
  quote?: {
    agentName: string;
    text: string;
  };
  isStreaming?: boolean;
  createdAt: string;
}

export interface MockRun {
  id: string;
  title: string;
  userPrompt: string;
  status: RunStatus;
  updatedAt: string;
  messages: SimulationMessage[];
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
