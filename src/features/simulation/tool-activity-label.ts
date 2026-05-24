export function formatToolActivityLabel(name: string, args: unknown): string {
  if (name === "check_npm_package") {
    return `📦 Vérification NPM : ${(args as { packageName?: string })?.packageName ?? "..."}...`;
  }
  if (name === "search_technical_norm") {
    return `📖 Consultation norme : ${(args as { query?: string })?.query ?? "..."}...`;
  }
  return `⚙️ Recherche en cours...`;
}
