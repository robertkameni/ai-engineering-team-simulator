/**
 * One simulation run must map to exactly one `/api/simulate` POST. A second
 * POST for the same prompt while the first is still in flight creates a
 * duplicate `Run` row that shows up twice in the Recent list.
 */
export function shouldSuppressDuplicateStart(
  inFlightPrompt: string | null,
  nextPrompt: string,
): boolean {
  return inFlightPrompt != null && inFlightPrompt === nextPrompt.trim();
}
