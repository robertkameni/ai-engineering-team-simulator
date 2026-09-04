import "server-only";

import { canExportApprovedRun } from "@/features/artifacts/artifact-panel-phase";
import { executeForgeHandoffPost } from "@/lib/api/forge-handoff-logic";
import { getTeamRoster } from "@/lib/db/team-roster";
import { getRunForWorkspaceIfOwned } from "@/lib/db/runs";
import { buildRunMarkdown } from "@/lib/export/build-run-export-document";
import { buildRunMarkdownFilename } from "@/lib/export/export-filename";
import { requireAuthenticatedExportSession } from "@/lib/export/require-authenticated-export-session";
import { getForgePartnerConfig } from "@/lib/forge/forge-config";
import { submitPartnerIngest } from "@/lib/forge/submit-partner-ingest";
import { assertRateLimit } from "@/lib/rate-limit";
import { rateLimitResponse } from "@/lib/rate-limit-response";

export async function handleForgeHandoffPost(
  request: Request,
  runId: string,
): Promise<Response> {
  return executeForgeHandoffPost(request, runId, {
    requireAuthenticatedUserId: async () => {
      const session = await requireAuthenticatedExportSession();
      if (!session.ok) {
        return {
          ok: false,
          response: Response.json(
            { error: "Authentication required to open Forge" },
            { status: 401 },
          ),
        };
      }
      return { ok: true, userId: session.userId };
    },
    assertRateLimit,
    rateLimitResponse,
    getOwnedRun: async (id, userId) =>
      getRunForWorkspaceIfOwned(id, { userId, guestSessionId: null }),
    getTeamRosterTemplateId: async (id) => {
      const roster = await getTeamRoster(id);
      return roster?.templateId ?? null;
    },
    canExportApprovedRun,
    buildMarkdown: (run, templateId) => buildRunMarkdown({ run, templateId }),
    buildFilename: buildRunMarkdownFilename,
    getForgeConfig: getForgePartnerConfig,
    submitPartnerIngest,
  });
}
