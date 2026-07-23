import "server-only";

import { getRunProgressIfOwned } from "@/lib/db/run-progress";
import {
  loadOwnedRunResource,
  type OwnedRunRouteParams,
} from "@/lib/api/owned-run-route";

/**
 * Lightweight run progress for stream-drop recovery (arch-review F2).
 * Full messages/artifacts stay on GET /api/runs/[id].
 */
export async function GET(
  _request: Request,
  { params }: OwnedRunRouteParams,
): Promise<Response> {
  const loaded = await loadOwnedRunResource(params, getRunProgressIfOwned);
  if (!loaded.ok) {
    return loaded.response;
  }

  return Response.json(loaded.data);
}
