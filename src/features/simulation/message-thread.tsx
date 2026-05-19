import { AgentMessage } from "@/features/simulation/agent-message";
import type { SimulationMessage } from "@/features/agents/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users } from "lucide-react";

interface MessageThreadProps {
  messages: SimulationMessage[];
  empty?: boolean;
}

export function MessageThread({ messages, empty }: MessageThreadProps) {
  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-border bg-surface-2">
          <Users className="size-5 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Describe what you want to build
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Your engineering team will debate the approach live — requirements,
          architecture, and tradeoffs.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 px-4">
      <div
        className="flex flex-col gap-8 py-4"
        aria-label="Engineering team discussion"
      >
        {messages.map((message) => (
          <AgentMessage key={message.id} message={message} />
        ))}
      </div>
    </ScrollArea>
  );
}
