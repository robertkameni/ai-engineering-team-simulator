/**
 * Shared rate-limit user-facing copy (arch-review F8).
 */

function formatRateLimitRetryMessage(
  retryAfterSec: number,
  actionLabel: string,
): string {
  const seconds = Math.max(1, Math.ceil(retryAfterSec));
  const unit = seconds === 1 ? "second" : "seconds";
  return `Too many ${actionLabel}, retry in ${seconds} ${unit}.`;
}

export function formatDeleteRateLimitError(retryAfterSec: number): string {
  return formatRateLimitRetryMessage(retryAfterSec, "deletions");
}

export function parseRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  if (header != null && header.trim().length > 0) {
    const fromHeader = Number(header);
    if (Number.isFinite(fromHeader) && fromHeader >= 0) {
      return fromHeader;
    }
  }
  return null;
}

export async function readRetryAfterFromResponse(
  response: Response,
): Promise<number | null> {
  const fromHeader = parseRetryAfterSeconds(response);
  if (fromHeader != null) {
    return fromHeader;
  }

  try {
    const raw: unknown = await response.clone().json();
    if (
      typeof raw === "object" &&
      raw !== null &&
      typeof (raw as { retryAfter?: unknown }).retryAfter === "number"
    ) {
      return (raw as { retryAfter: number }).retryAfter;
    }
  } catch {
    // Body may be empty or non-JSON.
  }

  return null;
}
