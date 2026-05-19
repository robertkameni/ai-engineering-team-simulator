/** Strip trailing speaker attributions from generated artifact bullets. */
export function normalizeArtifactItem(item: string): string {
  return item
    .replace(/^[\s○•\-–—]+\s*/, "")
    .replace(/\s*\([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\)\s*$/g, "")
    .replace(/\s*—\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*$/g, "")
    .trim();
}

export function normalizeArtifactTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
