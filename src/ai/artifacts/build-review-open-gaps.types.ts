import type { SimulationAgentRole } from "@/ai/agents/config";

export type ReviewOpenGapTopicKey =
  | "outbox_claimed_by"
  | "per_provider_queues"
  | "session_expiry_warning"
  | "backup_verification"
  | "generic";

export interface ReviewOpenGap {
  readonly topicKey: ReviewOpenGapTopicKey;
  readonly excerpt: string;
  readonly ownerRole: SimulationAgentRole | null;
}
