/** Stable time label for SSR + client (avoids locale/timezone hydration drift). */
export function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}
