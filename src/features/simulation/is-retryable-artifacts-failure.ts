/**
 * Distinguishes a real owned-run miss (`application/json` 404 from our
 * handler, ~25 bytes) from a Next.js HTML 404 (~4–5 kB gzipped). The HTML
 * miss happens in `next dev` when Turbopack has not compiled the artifacts
 * route yet; that compile miss is retryable. A JSON 404 is ownership or
 * a deleted run and must not be retried (IDOR-safe).
 */
export function isRetryableArtifactsFailure(
  status: number,
  contentType: string | null,
): boolean {
  if (status === 408 || status === 429 || status >= 500) {
    return true;
  }
  if (status !== 404) {
    return false;
  }
  return contentType != null && contentType.includes("text/html");
}
