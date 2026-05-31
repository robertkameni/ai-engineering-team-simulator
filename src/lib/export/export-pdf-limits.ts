export const EXPORT_PDF_MAX_MESSAGES = 50;
export const EXPORT_PDF_MAX_MESSAGE_CONTENT_CHARS = 51_200;
export const EXPORT_PDF_MAX_ARTIFACT_ITEMS = 500;
export const EXPORT_PDF_MAX_TITLE_CHARS = 500;
export const EXPORT_PDF_MAX_USER_PROMPT_CHARS = 4_000;
export const EXPORT_PDF_MAX_ARTIFACT_ITEM_CHARS = 2_048;
export const EXPORT_PDF_MAX_BODY_BYTES = 2 * 1024 * 1024;

export const PDF_DOCUMENT_TITLE = "Engineering Simulation Report";

export function resolvePdfDocumentTitle(): string {
  return PDF_DOCUMENT_TITLE;
}

export type ExportPdfArtifactPanels = {
  requirements?: { title: string; items: string[] }[];
  architecture?: { title: string; items: string[] }[];
  implementation?: { title: string; items: string[] }[];
  review?: { title: string; items: string[] }[];
} | null | undefined;

export function countExportArtifactItems(
  artifacts: ExportPdfArtifactPanels,
): number {
  if (artifacts == null) {
    return 0;
  }

  let total = 0;
  for (const panel of [
    artifacts.requirements,
    artifacts.architecture,
    artifacts.implementation,
    artifacts.review,
  ]) {
    if (!panel) continue;
    for (const section of panel) {
      total += section.items.length;
    }
  }
  return total;
}
