import { getPersona } from "@/features/agents/personas";
import type { AgentRole } from "@/features/agents/types";
import { AgentAvatar } from "@/features/agents/agent-avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AgentTypingIndicatorProps {
  role: AgentRole;
  label?: string;
  agentName?: string;
  agentTitle?: string;
}

export function AgentTypingIndicator({
  role,
  label = "Writing…",
  agentName,
  agentTitle,
}: AgentTypingIndicatorProps) {
  const persona = getPersona(role);
  const displayName = agentName ?? persona.name;
  const displayTitle = agentTitle ?? persona.title;

  return (
    <div
      className="message-enter flex shrink-0 gap-3 px-3 py-2 @md/workspace-main:px-4"
      aria-live="polite"
    >
      <AgentAvatar role={role} />
      <div className="glass-card flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-2 @md/workspace-main:gap-2">
        <span className="text-body font-semibold text-foreground">
          {displayName}
        </span>
        <Badge
          variant="outline"
          className={cn("text-[10px] font-medium", persona.badgeClass)}
        >
          {displayTitle}
        </Badge>
        <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <span className="pulse-glow size-1.5 rounded-full bg-agent-architect" />
          <span className="truncate">{label}</span>
        </span>
      </div>
    </div>
  );
}
