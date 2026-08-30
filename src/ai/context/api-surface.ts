import type { TranscriptEntry } from "@/ai/context/transcript";

export interface ApiSurfaceEntry {
  readonly method: string;
  readonly path: string;
}

const ENDPOINT_PATTERN =
  /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s,;)}"'`]+)/gi;

/**
 * Extracts the method + path pairs the team actually declared in the debate.
 * This is server-computed ground truth: artifact prompts should reuse these
 * endpoints verbatim instead of letting the synthesizing model reconstruct
 * (and drift) the API surface from memory.
 */
export function extractDeclaredApiSurface(
  transcript: readonly TranscriptEntry[],
): ApiSurfaceEntry[] {
  const entries: ApiSurfaceEntry[] = [];
  const seen = new Set<string>();

  for (const entry of transcript) {
    for (const match of entry.content.matchAll(ENDPOINT_PATTERN)) {
      const method = match[1]!.toUpperCase();
      const path = match[2]!.replace(/[.,;:)\]}>]+$/u, "");
      if (!path.startsWith("/api/")) {
        continue;
      }
      const key = `${method} ${path.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      entries.push({ method, path });
    }
  }

  return entries;
}

export function buildApiSurfaceDirective(
  surface: readonly ApiSurfaceEntry[],
): string {
  if (surface.length === 0) {
    return "";
  }

  const lines = surface.map((entry) => `- ${entry.method} ${entry.path}`).join("\n");

  return [
    "## Server-computed API surface (declared in the debate)",
    "These method + path pairs were declared by the team. The API endpoint section MUST list exactly these pairs — never add an endpoint no teammate declared and never drop one declared here.",
    "",
    lines,
    "",
    "Use the response codes the backend engineer stated for each endpoint; when codes conflict between messages, prefer the backend engineer's latest statement.",
  ].join("\n");
}
