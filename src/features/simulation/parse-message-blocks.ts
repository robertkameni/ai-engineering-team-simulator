export type MessageBlock =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "bullet"; text: string }
  | { type: "quote"; agentName: string; text: string; verdict?: string }
  | { type: "emphasis"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "spacer" };

const CLAIM_PATTERN =
  /^\*\*Claim from ([^:*]+):\*\*\s*"?([\s\S]+?)"?\s*$/i;
const VERDICT_PATTERN =
  /^\*\*(Agree|Disagree|Refine)\*\*\s*[—–-]?\s*(.*)$/i;
const BLOCKQUOTE_PATTERN = /^>\s*"?(.+?)"?\s*$/;

export function parseMessageBlocks(content: string): MessageBlock[] {
  const lines = content.split("\n");
  const blocks: MessageBlock[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      blocks.push({ type: "spacer" });
      continue;
    }

    const claimMatch = trimmed.match(CLAIM_PATTERN);
    if (claimMatch) {
      const nextLine = lines[index + 1]?.trim() ?? "";
      const verdictMatch = nextLine.match(VERDICT_PATTERN);
      blocks.push({
        type: "quote",
        agentName: claimMatch[1].trim(),
        text: claimMatch[2].trim().replace(/^"|"$/g, ""),
        verdict: verdictMatch
          ? `${verdictMatch[1]}${verdictMatch[2] ? ` — ${verdictMatch[2]}` : ""}`
          : undefined,
      });
      if (verdictMatch) index += 1;
      continue;
    }

    const blockquoteMatch = trimmed.match(BLOCKQUOTE_PATTERN);
    if (blockquoteMatch) {
      blocks.push({
        type: "quote",
        agentName: "Teammate",
        text: blockquoteMatch[1].trim().replace(/^"|"$/g, ""),
      });
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "heading", level: 3, text: trimmed.slice(4) });
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "heading", level: 2, text: trimmed.slice(3) });
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("○ ")) {
      blocks.push({
        type: "bullet",
        text: trimmed.replace(/^[-○]\s+/, ""),
      });
      continue;
    }

    if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      blocks.push({
        type: "emphasis",
        text: trimmed.slice(2, -2),
      });
      continue;
    }

    blocks.push({ type: "paragraph", text: trimmed });
  }

  return blocks;
}
