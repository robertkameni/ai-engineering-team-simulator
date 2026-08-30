import type { TranscriptEntry } from "@/ai/context/transcript";

export interface ApiSurfaceEntry {
  readonly method: string;
  readonly path: string;
}

const ENDPOINT_PATTERN =
  /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+`?(\/[^\s,;)"'`]+)`?/gi;

const PRODUCT_PATH_PREFIXES = [
  "/api/",
  "/auth",
  "/share",
  "/health",
  "/healthz",
  "/readyz",
  "/webhooks",
  "/orders",
  "/vendors",
  "/splits",
  "/menu",
  "/menus",
  "/users",
  "/items",
] as const;

const PROVIDER_FIRST_SEGMENTS = new Set([
  "account",
  "subscriptions",
  "charges",
  "customers",
  "invoices",
]);

const DEFERRED_ENDPOINT_WINDOW_BEFORE_CHARS = 100;
const DEFERRED_ENDPOINT_WINDOW_AFTER_CHARS = 80;

const DEFERRED_ENDPOINT_CONTEXT =
  /\b(later|future|v2|not (?:in|for) v1|flag(?:ged)?(?:\s+it)?\s+for(?:\s+later)?|deferred|out of scope)\b/i;

function isProviderPath(path: string): boolean {
  const firstSegment = path.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  if (!firstSegment) {
    return false;
  }
  if (/^v\d+$/.test(firstSegment)) {
    return true;
  }
  return PROVIDER_FIRST_SEGMENTS.has(firstSegment);
}

function pathWithoutQuery(path: string): string {
  const queryIndex = path.indexOf("?");
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

function isProductPath(path: string): boolean {
  const pathname = pathWithoutQuery(path);
  if (isProviderPath(pathname)) {
    return false;
  }
  return PRODUCT_PATH_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) {
      return pathname.startsWith(prefix);
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

function isDeferredEndpointMention(
  content: string,
  matchIndex: number,
  matchLength: number,
): boolean {
  const windowStart = Math.max(0, matchIndex - DEFERRED_ENDPOINT_WINDOW_BEFORE_CHARS);
  const windowEnd = Math.min(
    content.length,
    matchIndex + matchLength + DEFERRED_ENDPOINT_WINDOW_AFTER_CHARS,
  );
  return DEFERRED_ENDPOINT_CONTEXT.test(content.slice(windowStart, windowEnd));
}

function trimDeclaredPath(path: string): string {
  const withoutSoftPunctuation = path.replace(/[.,;:>]+$/u, "");
  if (
    withoutSoftPunctuation.includes("{") &&
    withoutSoftPunctuation.includes("}")
  ) {
    return withoutSoftPunctuation.replace(/[)>]+$/u, "");
  }
  if (
    withoutSoftPunctuation.includes("[") &&
    withoutSoftPunctuation.includes("]")
  ) {
    return withoutSoftPunctuation.replace(/[)>]+$/u, "");
  }
  return withoutSoftPunctuation.replace(/[)\]}>]+$/u, "");
}

function endpointKey(method: string, path: string): string {
  return `${method} ${path.toLowerCase()}`;
}

/**
 * Extracts the method + path pairs the team actually declared in the debate.
 * This is server-computed ground truth: artifact prompts should reuse these
 * endpoints verbatim instead of letting the synthesizing model reconstruct
 * (and drift) the API surface from memory.
 */
export function extractDeclaredApiSurface(
  transcript: readonly TranscriptEntry[],
): ApiSurfaceEntry[] {
  const entries = new Map<string, ApiSurfaceEntry>();

  for (const entry of transcript) {
    for (const match of entry.content.matchAll(ENDPOINT_PATTERN)) {
      const method = match[1]!.toUpperCase();
      const path = trimDeclaredPath(match[2]!);
      if (!isProductPath(path)) {
        continue;
      }
      if (
        match.index !== undefined &&
        isDeferredEndpointMention(entry.content, match.index, match[0].length)
      ) {
        continue;
      }

      entries.set(endpointKey(method, path), { method, path });
    }
  }

  return [...entries.values()];
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
