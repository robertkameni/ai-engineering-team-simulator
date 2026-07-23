/**
 * Parse a numeric environment variable with a fallback.
 * Callers supply domain-specific validity (non-negative rates vs positive ints).
 */
export function parseEnvNumber(
  name: string,
  fallback: number,
  isValid: (value: number) => boolean,
): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  return isValid(parsed) ? parsed : fallback;
}
