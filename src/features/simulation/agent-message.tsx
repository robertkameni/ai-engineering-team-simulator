import { AgentAvatar } from "@/features/agents/agent-avatar";
import { getPersona } from "@/features/agents/personas";
import type { SimulationMessage } from "@/features/agents/types";
import { MessageContent } from "@/features/simulation/message-content";
import { QuotedBlock } from "@/features/simulation/quoted-block";
import { formatToolActivityLabel } from "@/features/simulation/tool-activity-label";
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
          {message.activeTools?.map((tool, idx) => (
            <div
              key={idx}
              className="mb-3 flex w-fit animate-pulse items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1.5 text-xs font-medium text-blue-600"
            >
              {formatToolActivityLabel(tool.name, tool.args)}
            </div>
          ))}
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
