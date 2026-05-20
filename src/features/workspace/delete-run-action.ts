"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteRun } from "@/lib/db/runs";

export async function deleteRunAction(formData: FormData) {
  const runId = formData.get("runId");
  const activePath = formData.get("activePath");

  if (typeof runId !== "string" || runId.length === 0) {
    return;
  }

  const deleted = await deleteRun(runId);
  if (!deleted) {
    return;
  }

  revalidatePath("/");
  revalidatePath("/workspace");

  if (activePath === `/runs/${runId}`) {
    redirect("/workspace");
  }
}
