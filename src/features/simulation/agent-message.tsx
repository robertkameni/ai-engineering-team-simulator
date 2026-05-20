import { AgentAvatar } from "@/features/agents/agent-avatar";
import { getPersona } from "@/features/agents/personas";
import type { SimulationMessage } from "@/features/agents/types";
import { MessageContent } from "@/features/simulation/message-content";
import { QuotedBlock } from "@/features/simulation/quoted-block";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AgentMessageProps {
  message: SimulationMessage;
  className?: string;
}

export function AgentMessage({ message, className }: AgentMessageProps) {
  const persona = getPersona(message.role);
  const displayName = message.agentName ?? persona.name;
  const displayTitle = message.agentTitle ?? persona.title;

  return (
    <article
      className={cn(
        "message-enter @container/agent-message flex gap-2 @md/agent-message:gap-3",
        className,
      )}
    >
      <AgentAvatar role={message.role} />
      <div className="min-w-0 flex-1">
        <header className="mb-1.5 flex flex-wrap items-center gap-1.5 @md/agent-message:mb-2 @md/agent-message:gap-2">
          <span className="text-body font-semibold text-foreground">
            {displayName}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-medium",
              persona.badgeClass,
            )}
          >
            {displayTitle}
          </Badge>
          <span className="hidden text-caption text-muted-foreground @md/agent-message:inline">
            {message.createdAt}
          </span>
        </header>
        <div
          className={cn(
            "glass-card rounded-xl border-l-[3px] px-3 py-2.5 @md/agent-message:px-4 @md/agent-message:py-3",
            persona.borderClass,
          )}
        >
          {message.quote ? (
            <QuotedBlock
              agentName={message.quote.agentName}
              text={message.quote.text}
            />
          ) : null}
          <MessageContent content={message.content} />
          {message.isStreaming ? (
            <span
              className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground"
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
