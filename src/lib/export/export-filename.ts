export function slugifyRunTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "simulation-run";
}

export function buildRunMarkdownFilename(title: string, exportId?: number): string {
  const base = slugifyRunTitle(title);
  return exportId != null ? `${base}-${exportId}.md` : `${base}.md`;
}

export function buildRunPdfFilename(title: string, exportId?: number): string {
  const base = slugifyRunTitle(title);
  return exportId != null ? `${base}-${exportId}.pdf` : `${base}.pdf`;
}
