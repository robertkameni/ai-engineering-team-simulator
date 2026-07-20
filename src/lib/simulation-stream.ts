import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { AgentRole } from "@/features/agents/types";

/** Shared SSE event shapes (client + server). */
export type SimulationStreamEvent =
  | {
      type: "run_started";
      runId: string;
    }
  | {
      type: "team_ready";
      templateId: TeamTemplateId;
      members: { role: SimulationAgentRole; name: string; title: string }[];
    }
  | {
      type: "agent_start";
      role: AgentRole;
      name: string;
      title: string;
    }
  | {
      type: "text-delta";
      role: AgentRole;
      delta: string;
    }
  | {
      type: "tool_start";
      role: AgentRole;
      toolName: string;
      args: unknown;
    }
  | {
      type: "tool_end";
      role: AgentRole;
      toolName: string;
    }
  | {
      type: "agent_end";
      role: AgentRole;
    }
  | {
      type: "artifacts_start";
    }
  | {
      type: "artifact_complete";
      artifactType: string;
    }
  | {
      type: "all_artifacts_complete";
    }
  | {
      type: "done";
      runId: string;
      /** True when synthesis timed out; client should fall back to polling. */
      artifactTimeout?: boolean;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "heartbeat";
    };

export function encodeSimulationEvent(event: SimulationStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseSimulationEvent(line: string): SimulationStreamEvent | null {
  if (!line.startsWith("data: ")) return null;
  try {
    return JSON.parse(line.slice(6)) as SimulationStreamEvent;
  } catch {
    return null;
  }
}
