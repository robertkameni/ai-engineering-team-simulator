import { cache } from "react";

import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { getRunForWorkspaceIfOwned } from "@/lib/db/runs";

/**
 * Request-scoped run fetch for /runs/[id].
 * Shared by layout (404 gate), page, and generateMetadata via React.cache.
 */
export const getCachedRunPageView = cache(async (id: string) => {
  const scope = await getRunOwnershipContext();
  return getRunForWorkspaceIfOwned(id, scope);
});
