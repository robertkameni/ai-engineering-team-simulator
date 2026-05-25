"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { deleteRunIfOwned } from "@/lib/db/runs";

export async function deleteRunAction(formData: FormData) {
  const runId = formData.get("runId");
  const activePath = formData.get("activePath");

  if (typeof runId !== "string" || runId.length === 0) {
    return;
  }

  const ownership = await getRunOwnershipContext();
  const result = await deleteRunIfOwned(runId, ownership);

  if (result !== "deleted") {
    return;
  }

  revalidatePath("/");
  revalidatePath("/workspace");

  if (activePath === `/runs/${runId}`) {
    redirect("/workspace");
  }
}
