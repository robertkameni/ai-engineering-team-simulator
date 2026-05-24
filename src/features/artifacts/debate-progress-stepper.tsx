import { SIMULATION_AGENT_ORDER, type SimulationAgentRole } from "@/ai/agents/config";
import { getPersona } from "@/features/agents/personas";
import type { AgentRole } from "@/features/agents/types";
import type { TeamRosterPreview } from "@/features/simulation/team-roster-preview";
import { teamMemberPreview } from "@/features/simulation/team-roster-preview";
import { cn } from "@/lib/utils";

type StepState = "complete" | "active" | "upcoming";

interface DebateProgressMessage {
  role: AgentRole;
  isStreaming?: boolean;
  agentTitle?: string;
}

interface DebateProgressStepperProps {
  messages: DebateProgressMessage[];
  activeAgent: AgentRole | null;
  teamRoster?: TeamRosterPreview | null;
}

function stepState(
  role: AgentRole,
  messages: DebateProgressMessage[],
  activeAgent: AgentRole | null,
): StepState {
  const message = messages.find((entry) => entry.role === role);
  if (activeAgent === role || message?.isStreaming) return "active";
  if (message && !message.isStreaming) return "complete";
  return "upcoming";
}

function roleTitle(
  role: SimulationAgentRole,
  messages: DebateProgressMessage[],
  teamRoster?: TeamRosterPreview | null,
): string {
  return (
    messages.find((entry) => entry.role === role)?.agentTitle ??
    teamMemberPreview(teamRoster, role)?.title ??
    getPersona(role).title
  );
}

export function DebateProgressStepper({
  messages,
  activeAgent,
  teamRoster,
}: DebateProgressStepperProps) {
  return (
    <ol className="flex w-full max-w-xs flex-col gap-2 text-left">
      {SIMULATION_AGENT_ORDER.map((role) => {
        const persona = getPersona(role);
        const state = stepState(role, messages, activeAgent);
        const title = roleTitle(role, messages, teamRoster);

        return (
          <li
            key={role}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-caption transition-colors",
              state === "complete" &&
                "border-agent-backend/30 bg-agent-backend/5 text-foreground",
              state === "active" &&
                "border-agent-architect/40 bg-agent-architect/10 text-foreground",
              state === "upcoming" &&
                "border-glass-border text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                state === "complete" && "bg-agent-backend/20 text-agent-backend",
                state === "active" &&
                  "bg-agent-architect/20 text-agent-architect animate-pulse",
                state === "upcoming" && "bg-muted text-muted-foreground",
              )}
            >
              {state === "complete" ? "✓" : persona.initials}
            </span>
            <span className="truncate">{title}</span>
          </li>
        );
      })}
    </ol>
  );
}
