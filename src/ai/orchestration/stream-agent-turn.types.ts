import type { AgentStreamContextParams } from "@/ai/orchestration/agent-stream-context.types";

export type { AgentStreamContextParams, CollectAgentStreamParams } from "@/ai/orchestration/agent-stream-context.types";

export interface AgentStreamRetryParams extends AgentStreamContextParams {
  readonly fullText: string;
}
