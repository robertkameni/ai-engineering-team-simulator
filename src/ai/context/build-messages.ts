import type { ModelMessage } from "ai";

import type { TeamRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { getAgentTurnPrompt } from "@/ai/prompts";
import type { AgentRole } from "@/features/agents/types";

export function buildAgentMessages(
  role: AgentRole,
  productIdea: string,
  transcript: TranscriptEntry[],
  roster: TeamRoster,
): ModelMessage[] {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: `## Product idea\n\n${productIdea}`,
    },
  ];

  for (const entry of transcript) {
    messages.push({
      role: "assistant",
      content: formatTranscriptMessage(entry),
    });
  }

  if (transcript.length > 0) {
    messages.push({
      role: "user",
      content: getAgentTurnPrompt(role, productIdea, roster),
    });
  } else {
    messages[0] = {
      role: "user",
      content: getAgentTurnPrompt(role, productIdea, roster),
    };
  }

  return messages;
}

function formatTranscriptMessage(entry: TranscriptEntry): string {
  return `**${entry.agentName}** (${entry.role}):\n\n${entry.content}`;
}
