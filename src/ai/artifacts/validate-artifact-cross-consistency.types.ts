import type { ReviewOpenGapTopicKey } from "@/ai/artifacts/build-review-open-gaps.types";

export interface OpenGapClaimPattern {
  readonly topicKey: ReviewOpenGapTopicKey;
  readonly claimPattern: RegExp;
}
