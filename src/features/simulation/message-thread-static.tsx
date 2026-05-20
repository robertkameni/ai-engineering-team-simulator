import { AgentMessage } from "@/features/simulation/agent-message";
import type { SimulationMessage } from "@/features/agents/types";

interface MessageThreadStaticProps {
  messages: SimulationMessage[];
}

/** Server-rendered thread for saved runs — native scroll, no Radix/hydration. */
export function MessageThreadStatic({ messages }: MessageThreadStaticProps) {
  return (
    <div
      className="@container/message-thread min-h-0 flex-1 overflow-y-auto overscroll-contain max-[719px]:pb-16 min-[720px]:pb-0"
      aria-label="Engineering team discussion"
    >
      <div className="flex flex-col gap-4 px-3 py-3 @md/message-thread:gap-8 @md/message-thread:px-4 @md/message-thread:py-4">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={
              index > 2
                ? "[content-visibility:auto] [contain-intrinsic-size:auto_12rem]"
                : undefined
            }
          >
            <AgentMessage message={message} />
          </div>
        ))}
      </div>
    </div>
  );
}
