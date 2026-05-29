/**
 * Start a same-origin file download in the current user-gesture stack (no await before this).
 * Use for server-generated files (e.g. saved-run PDF) so repeat downloads are not blocked.
 */
export function downloadExportUrl(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => link.remove(), 2_000);
}

export function downloadExportBlob(
  blob: Blob,
  filename: string,
  mimeType: string,
): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.type = mimeType;
  link.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 2_000);
}
