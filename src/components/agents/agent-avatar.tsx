import { getPersona } from "@/lib/agents/personas";
import type { AgentRole } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AgentAvatarProps {
  role: AgentRole;
  className?: string;
}

export function AgentAvatar({ role, className }: AgentAvatarProps) {
  const persona = getPersona(role);

  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold",
        persona.accentClass,
        className,
      )}
      aria-hidden
    >
      {persona.initials}
    </div>
  );
}
