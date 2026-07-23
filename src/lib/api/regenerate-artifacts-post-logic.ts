import type { RegenerateRunArtifactsResult } from "@/ai/artifacts/regenerate-run-artifacts.types";
import type { RegenerateArtifactsAccessHooks } from "@/lib/api/regenerate-artifacts-hooks";
import { runAccessDeniedResponse } from "@/lib/auth/run-access-denied-response";
import type { RunOwnershipScope } from "@/lib/auth/run-ownership";
import type { RateLimitResult } from "@/lib/rate-limit-config";

export interface RegenerateArtifactsPostHooks extends RegenerateArtifactsAccessHooks {
  rateLimitResponse: (result: Extract<RateLimitResult, { ok: false; }>) => Response;
}

function mapRegenerateErrorResponse(
  result: Extract<RegenerateRunArtifactsResult, { ok: false; }>,
): Response {
  if (result.error === "not_found" || result.error === "forbidden") {
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
  if (result.error === "budget_exceeded") {
    return Response.json(
      {
        error:
          "This run reached the simulation cost limit. Debate results are saved; artifacts could not be generated.",
      },
      { status: 400 },
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
    return runAccessDeniedResponse(access);
  }

  const rateLimit = await hooks.assertRateLimit(request, "regenerate", scope.userId);
  if (!rateLimit.ok) {
    return hooks.rateLimitResponse(rateLimit);
  }

  const result = await hooks.regenerateRunArtifactsWithUsage(runId, scope);
  if (!result.ok) {
    return mapRegenerateErrorResponse(result);
  }

  return Response.json({
    artifacts: result.artifacts,
    status: "ready" as const,
  });
}
