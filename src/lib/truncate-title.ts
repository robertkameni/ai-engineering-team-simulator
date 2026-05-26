export function truncateTitle(prompt: string, max = 48): string {
  if (prompt.length <= max) return prompt;
  return `${prompt.slice(0, max).trim()}…`;
}
