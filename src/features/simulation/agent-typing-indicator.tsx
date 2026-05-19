import { getPersona } from "@/features/agents/personas";
import type { AgentRole } from "@/features/agents/types";
import { AgentAvatar } from "@/features/agents/agent-avatar";
import { Badge } from "@/components/ui/badge";

interface AgentTypingIndicatorProps {
  role: AgentRole;
  label?: string;
}

export function AgentTypingIndicator({
  role,
  label = "Writing…",
}: AgentTypingIndicatorProps) {
  const persona = getPersona(role);

  return (
    <div className="flex gap-3 px-4 py-2" aria-live="polite">
      <AgentAvatar role={role} />
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {persona.name}
        </span>
        <Badge variant="outline" className="text-[10px] font-normal">
          {persona.title}
        </Badge>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-agent-architect" />
          {label}
        </span>
      </div>
    </div>
  );
}
