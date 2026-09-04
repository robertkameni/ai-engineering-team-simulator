import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { RateLimitResult } from "@/lib/rate-limit-config";
import type { ForgePartnerConfig } from "@/lib/forge/forge-config";
import { ForgePartnerError } from "@/lib/forge/forge-handoff-errors";
import type { SubmitPartnerIngestResult } from "@/lib/forge/submit-partner-ingest";
import type { MockRun } from "@/lib/types";

export type ForgeHandoffAuth =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export type ForgeHandoffHooks = {
  requireAuthenticatedUserId: () => Promise<ForgeHandoffAuth>;
  assertRateLimit: (
    request: Request,
    action: "forge_handoff",
    userId: string | null,
  ) => Promise<RateLimitResult>;
  rateLimitResponse: (result: Extract<RateLimitResult, { ok: false }>) => Response;
  getOwnedRun: (runId: string, userId: string) => Promise<MockRun | null>;
  getTeamRosterTemplateId: (runId: string) => Promise<TeamTemplateId | null>;
  canExportApprovedRun: (params: {
    readonly debateOutcome: MockRun["debateOutcome"];
    readonly artifacts: MockRun["artifacts"];
  }) => boolean;
  buildMarkdown: (run: MockRun, templateId?: TeamTemplateId) => string;
  buildFilename: (title: string, exportId: string) => string;
  getForgeConfig: () => ForgePartnerConfig | null;
  submitPartnerIngest: (input: {
    markdown: string;
    sourceFilename: string;
    baseUrl: string;
    partnerSecret: string;
  }) => Promise<SubmitPartnerIngestResult>;
};

function mapForgePartnerFailure(error: ForgePartnerError): Response {
  if (error.statusCode === 429) {
    return Response.json(
      { error: "Forge is busy. Try again shortly." },
      { status: 429 },
    );
  }

  if (error.statusCode === 503) {
    return Response.json(
      { error: "Forge is temporarily unavailable." },
      { status: 503 },
    );
  }

  const status =
    error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502;
  return Response.json({ error: "Could not start Forge pipeline" }, { status });
}

export async function executeForgeHandoffPost(
  request: Request,
  runId: string,
  hooks: ForgeHandoffHooks,
): Promise<Response> {
  const auth = await hooks.requireAuthenticatedUserId();
  if (!auth.ok) {
    return auth.response;
  }

  const rateLimit = await hooks.assertRateLimit(
    request,
    "forge_handoff",
    auth.userId,
  );
  if (!rateLimit.ok) {
    return hooks.rateLimitResponse(rateLimit);
  }

  const run = await hooks.getOwnedRun(runId, auth.userId);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (
    !hooks.canExportApprovedRun({
      debateOutcome: run.debateOutcome,
      artifacts: run.artifacts,
    })
  ) {
    return Response.json(
      {
        error:
          "Artifacts are not ready for this approved run. Wait for synthesis to finish, then retry.",
      },
      { status: 409 },
    );
  }

  const config = hooks.getForgeConfig();
  if (!config) {
    return Response.json(
      { error: "Forge handoff is not configured" },
      { status: 503 },
    );
  }

  const templateId = (await hooks.getTeamRosterTemplateId(runId)) ?? undefined;
  const markdown = hooks.buildMarkdown(run, templateId);
  const sourceFilename = hooks.buildFilename(run.title, crypto.randomUUID());

  try {
    const result = await hooks.submitPartnerIngest({
      markdown,
      sourceFilename,
      baseUrl: config.baseUrl,
      partnerSecret: config.partnerSecret,
    });

    return Response.json({ trackerUrl: result.trackerUrl }, { status: 200 });
  } catch (error) {
    if (error instanceof ForgePartnerError) {
      return mapForgePartnerFailure(error);
    }

    return Response.json(
      { error: "Could not start Forge pipeline" },
      { status: 502 },
    );
  }
}
