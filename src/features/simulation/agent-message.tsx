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
        "flex gap-3",
        className,
      )}
    >
      <AgentAvatar role={message.role} />
      <div className="min-w-0 flex-1">
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {displayName}
          </span>
          <Badge variant="outline" className="text-[10px] font-normal">
            {displayTitle}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {message.createdAt}
          </span>
        </header>
        <div
          className={cn(
            "rounded-lg border border-border border-l-[3px] bg-surface-2 px-4 py-3",
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
