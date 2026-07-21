import { decideDebateConvergence } from "@/ai/orchestration/debate-convergence-controller";
import type { DebateExitOutcome } from "@/ai/orchestration/reviewer-decision";

import { assertNotAborted } from "./simulation-abort";
import { runDebateTurn } from "./execute-debate-turn";
import type { DebateState, TurnContext } from "./run-simulation-types";

export async function runDebateLoop(
  state: DebateState,
  ctx: TurnContext,
): Promise<DebateExitOutcome> {
  while (true) {
    assertNotAborted(ctx.abortSignal);

    const convergence = decideDebateConvergence(state, {
      templateId: ctx.templateId,
    });
    if (convergence.kind === "finalize") {
      return convergence.outcome;
    }

    state.phase = convergence.phase;
    state.nextRole = convergence.role;
    if (convergence.phase === "ops_closure") {
      state.hasHadOpsFollowUpForCurrentReject = true;
    }

    const directive = await runDebateTurn(state, ctx);
    if (directive.kind === "break") {
      return directive.outcome;
    }
  }
}
