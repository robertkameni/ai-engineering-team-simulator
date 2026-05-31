import type { RegenerateRunArtifactsResult } from "@/ai/artifacts/regenerate-run-artifacts";
import type {
  RequireRunAccessResult,
  RunOwnershipScope,
} from "@/lib/auth/run-ownership";
import type { RateLimitResult } from "@/lib/rate-limit-config";

function accessDeniedResponse(
  access: Extract<RequireRunAccessResult, { ok: false }>,
): Response {
  if (access.reason === "not_found") {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

export interface RegenerateArtifactsPostHooks {
  requireRunAccess: (
    runId: string,
    scope: RunOwnershipScope,
  ) => Promise<RequireRunAccessResult>;
  assertRateLimit: (
    request: Request,
    action: "regenerate",
    userId?: string | null,
  ) => Promise<RateLimitResult>;
  regenerateRunArtifactsWithUsage: (
    runId: string,
  ) => Promise<RegenerateRunArtifactsResult>;
  rateLimitResponse: (result: Extract<RateLimitResult, { ok: false }>) => Response;
}

function mapRegenerateErrorResponse(
  result: Extract<RegenerateRunArtifactsResult, { ok: false }>,
): Response {
  if (result.error === "not_found") {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }
  if (result.error === "no_messages") {
    return Response.json(
      { error: "Run has no debate messages to synthesize from" },
      { status: 400 },
    );
  }
  if (result.error === "run_in_progress") {
    return Response.json(
      { error: "Artifacts can only be regenerated after the run finishes" },
      { status: 409 },
    );
  }
  if (result.error === "generation_active") {
    return Response.json(
      {
        error:
          result.message ??
          "A generation process is already active for this workspace.",
      },
      { status: 409 },
    );
  }
  return Response.json(
    { error: result.message ?? "Artifact generation failed" },
    { status: 500 },
  );
}

export async function executeRegenerateArtifactsPost(
  request: Request,
  runId: string,
  scope: RunOwnershipScope,
  hooks: RegenerateArtifactsPostHooks,
): Promise<Response> {
  const access = await hooks.requireRunAccess(runId, scope);
  if (!access.ok) {
    return accessDeniedResponse(access);
  }

  const rateLimit = await hooks.assertRateLimit(request, "regenerate", scope.userId);
  if (!rateLimit.ok) {
    return hooks.rateLimitResponse(rateLimit);
  }

  const result = await hooks.regenerateRunArtifactsWithUsage(runId);
  if (!result.ok) {
    return mapRegenerateErrorResponse(result);
  }

  return Response.json({
    artifacts: result.artifacts,
    status: "ready" as const,
  });
}
