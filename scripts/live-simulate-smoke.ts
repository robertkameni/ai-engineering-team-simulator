/**
 * Live smoke: POST /api/simulate and summarize SSE + final artifacts + DB summary.
 * Usage: npx tsx --env-file=.env.local scripts/live-simulate-smoke.ts "prompt text"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../src/generated/prisma/client";

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/live-simulate-smoke.ts "<prompt>"');
  process.exit(1);
}

const baseUrl = process.env.LIVE_BASE_URL ?? "http://localhost:3100";
const startedAt = Date.now();
const outDir = path.join(process.cwd(), ".live-verify");
mkdirSync(outDir, { recursive: true });

const events: string[] = [];
const eventLog: Array<{ t: number; type: string; detail?: string }> = [];
let runId: string | null = null;
let cookie = "";
let artifactTimeout = false;
let allArtifactsComplete = false;
let allArtifactsCompleteAt: number | null = null;
let doneAt: number | null = null;
let artifactCompleteCount = 0;
let doneSeen = false;
let errorMessage: string | null = null;
let lastAgentEndAt: number | null = null;

function mergeSetCookie(res: Response): void {
  const getSetCookie = (
    res.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.();
  if (getSetCookie && getSetCookie.length > 0) {
    const parts = getSetCookie.map((c) => c.split(";")[0]!);
    cookie = cookie ? `${cookie}; ${parts.join("; ")}` : parts.join("; ");
    return;
  }
  const raw = res.headers.get("set-cookie");
  if (!raw) return;
  const first = raw.split(";")[0]!;
  cookie = cookie ? `${cookie}; ${first}` : first;
}

function logEvent(type: string, detail?: string): void {
  const t = Date.now() - startedAt;
  eventLog.push({ t, type, detail });
  events.push(type);
  console.log(
    JSON.stringify({
      phase: "sse",
      t,
      type,
      detail: detail ?? null,
    }),
  );
}

async function readDbSummary(id: string) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return { error: "DATABASE_URL missing" as const };
  }

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  try {
    const run = await prisma.run.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        artifactStatus: true,
        summary: true,
        estimatedCostUsd: true,
        promptTokens: true,
        completionTokens: true,
        artifacts: { select: { type: true } },
      },
    });
    if (!run) return { error: "run not found" as const };

    let summary: Record<string, unknown> | null = null;
    try {
      summary = run.summary
        ? (JSON.parse(run.summary) as Record<string, unknown>)
        : null;
    } catch {
      summary = { parseError: true };
    }

    return {
      status: run.status,
      artifactStatus: run.artifactStatus,
      estimatedCostUsd: run.estimatedCostUsd,
      promptTokens: run.promptTokens,
      completionTokens: run.completionTokens,
      artifactTypes: run.artifacts.map((a) => a.type),
      summary,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function fetchOwned(pathname: string) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      Origin: baseUrl,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { status: res.status, body };
}

async function main(): Promise<void> {
  console.log(JSON.stringify({ phase: "start", prompt, baseUrl }));

  const response = await fetch(`${baseUrl}/api/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
    body: JSON.stringify({ prompt }),
  });
  mergeSetCookie(response);

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(`simulate failed ${response.status}: ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      try {
        const event = JSON.parse(dataLine.slice(5).trim()) as Record<
          string,
          unknown
        >;
        const type = String(event.type ?? "unknown");
        const detail =
          (event.role as string | undefined) ||
          (event.artifactType as string | undefined) ||
          (event.message as string | undefined) ||
          (event.artifactTimeout === true ? "artifactTimeout" : undefined);

        if (
          [
            "run_started",
            "team_ready",
            "agent_start",
            "agent_end",
            "artifacts_start",
            "artifact_complete",
            "all_artifacts_complete",
            "done",
            "error",
          ].includes(type)
        ) {
          logEvent(type, detail);
        } else {
          events.push(type);
        }

        if (type === "run_started") {
          runId = String(event.runId);
        }
        if (type === "agent_end") {
          lastAgentEndAt = Date.now() - startedAt;
        }
        if (type === "artifact_complete") {
          artifactCompleteCount += 1;
        }
        if (type === "all_artifacts_complete") {
          allArtifactsComplete = true;
          allArtifactsCompleteAt = Date.now() - startedAt;
        }
        if (type === "done") {
          doneSeen = true;
          doneAt = Date.now() - startedAt;
          runId = String(event.runId ?? runId);
          artifactTimeout = event.artifactTimeout === true;
        }
        if (type === "error") {
          errorMessage = String(event.message ?? "error");
        }
      } catch {
        // ignore malformed
      }
    }
  }

  let artifactsStatus: string | null = null;
  let debateOutcome: string | null = null;
  let coreCounts: Record<string, number> = {};
  let filledCore = 0;
  let db: Awaited<ReturnType<typeof readDbSummary>> | null = null;

  if (runId) {
    const artifactsResponse = await fetchOwned(`/api/runs/${runId}/artifacts`);
    if (artifactsResponse.status === 200) {
      const data = artifactsResponse.body as {
        status?: string;
        debateOutcome?: string | null;
        artifacts?: Record<string, unknown> | null;
      };
      artifactsStatus = data.status ?? null;
      debateOutcome = data.debateOutcome ?? null;
      const arts = data.artifacts ?? {};
      for (const key of [
        "requirements",
        "architecture",
        "implementation",
        "blueprint",
        "review",
      ]) {
        const value = arts[key];
        const n = Array.isArray(value) ? value.length : value ? 1 : 0;
        coreCounts[key] = n;
      }
      filledCore = Object.values(coreCounts).filter((n) => n > 0).length;
    }

    const runResponse = await fetchOwned(`/api/runs/${runId}`);
    if (runResponse.status === 200) {
      const runData = runResponse.body as {
        debateOutcome?: string | null;
        artifactsStatus?: string;
      };
      debateOutcome = runData.debateOutcome ?? debateOutcome;
      artifactsStatus = runData.artifactsStatus ?? artifactsStatus;
    }

    try {
      db = await readDbSummary(runId);
    } catch (error) {
      db = { error: String(error) };
    }
  }

  const summary =
    db && "summary" in db && db.summary && !("parseError" in db.summary)
      ? db.summary
      : null;

  const report = {
    prompt,
    runId,
    elapsedMs: Date.now() - startedAt,
    doneSeen,
    artifactTimeout,
    allArtifactsComplete,
    allArtifactsBeforeDone:
      allArtifactsCompleteAt != null &&
      doneAt != null &&
      allArtifactsCompleteAt <= doneAt,
    artifactCompleteCount,
    lastAgentEndAt,
    allArtifactsCompleteAt,
    doneAt,
    errorMessage,
    debateOutcome,
    artifactsStatus,
    coreCounts,
    filledCore,
    eventCounts: events.reduce<Record<string, number>>((acc, type) => {
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {}),
    db,
    acceptance: {
      debateOutcome:
        (summary?.debateOutcome as string | null | undefined) ?? debateOutcome,
      debateDurationMs: (summary?.debateDurationMs as number | null) ?? null,
      artifactDurationMs: (summary?.artifactDurationMs as number | null) ?? null,
      totalDurationMs: (summary?.totalDurationMs as number | null) ?? null,
      userWaitMs: (summary?.userWaitMs as number | null) ?? null,
      artifactsPending: (summary?.artifactsPending as boolean | null) ?? null,
      postApproveTruncation:
        (summary?.postApproveTruncation as boolean | null) ?? null,
      turnCount: (summary?.turnCount as number | null) ?? null,
      filledCore,
      costUsd:
        db && "estimatedCostUsd" in db ? db.estimatedCostUsd : null,
    },
  };

  const label =
    prompt
      .slice(0, 40)
      .replace(/[^\w]+/g, "-")
      .replace(/^-|-$/g, "") || "run";
  const outPath = path.join(outDir, `${Date.now()}-${label}.json`);
  writeFileSync(outPath, JSON.stringify({ ...report, eventLog }, null, 2));

  console.log(
    JSON.stringify({ phase: "report", outPath, ...report }, null, 2),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ phase: "fatal", error: String(error) }));
  process.exit(1);
});
