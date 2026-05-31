export type RunAccessDeniedReason = "not_found" | "forbidden";

export interface RunAccessDeniedResult {
  ok: false;
  reason: RunAccessDeniedReason;
}

export function runAccessDeniedResponse(
  _access: RunAccessDeniedResult,
): Response {
  return Response.json({ error: "Run not found" }, { status: 404 });
}
