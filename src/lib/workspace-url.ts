function workspaceUrlForPrompt(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "/workspace";
  }

  return `/workspace?prompt=${encodeURIComponent(trimmed)}`;
}

/** Prefill the composer without auto-starting — user can edit before rerun. */
export function workspaceUrlForRerun(prompt: string): string {
  return `${workspaceUrlForPrompt(prompt)}&prepare=1`;
}

export function isWorkspacePrepareMode(
  prepare: string | string[] | undefined,
): boolean {
  if (prepare === "1" || prepare === "true") {
    return true;
  }
  if (Array.isArray(prepare)) {
    return prepare.some((value) => value === "1" || value === "true");
  }
  return false;
}

export function hasWorkspacePrompt(prompt: string | null | undefined): boolean {
  return typeof prompt === "string" && prompt.trim().length > 0;
}
