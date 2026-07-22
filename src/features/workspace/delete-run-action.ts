"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { executeDeleteRunAction } from "@/features/workspace/delete-run-action-logic";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { deleteRunIfOwned } from "@/lib/db/runs";
import { formatDeleteRateLimitError } from "@/lib/rate-limit-message";
import { assertRateLimit } from "@/lib/rate-limit";

export type DeleteRunActionState = {
  error: string | null;
};

export async function deleteRunAction(
  _previousState: DeleteRunActionState,
  formData: FormData,
): Promise<DeleteRunActionState> {
  const runId = formData.get("runId");
  const activePath = formData.get("activePath");

  const ownership = await getRunOwnershipContext();
  const headerList = await headers();
  const request = new Request("http://internal.local/delete", {
    headers: headerList,
  });

  const result = await executeDeleteRunAction(
    typeof runId === "string" ? runId : null,
    typeof activePath === "string" ? activePath : null,
    ownership,
    request,
    { assertRateLimit, deleteRunIfOwned },
  );

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return {
        error: formatDeleteRateLimitError(result.retryAfterSec ?? 60),
      };
    }
    if (result.reason === "not_deleted") {
      revalidatePath("/");
      revalidatePath("/workspace");
    }
    return { error: null };
  }

  revalidatePath("/");
  revalidatePath("/workspace");

  if (result.shouldRedirect) {
    redirect("/workspace");
  }

  return { error: null };
}
