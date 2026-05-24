/** Pool of starter ideas shown as chips on the landing page (3 picked per visit). */
export const EXAMPLE_PROMPT_POOL = [
  "Build a food delivery app for students",
  "Build an AI travel planner for Europe",
  "Create a study group matching platform",
  "Design a subscription analytics dashboard for indie SaaS founders",
  "Build a church community food donation coordination app",
  "Create a roommate expense-splitting app for shared apartments",
  "Plan a school plumbing renovation with DTU 60.1 compliance checks",
  "Build an IFC/BIM assistant to verify building conformity against French norms",
  "Design an HR onboarding portal for remote-first startups",
  "Plan a campus bike-sharing program with fleet maintenance tracking",
  "Renovate a restaurant kitchen ventilation system to ERP fire-safety standards",
  "Build a field inspection app for construction sites with compliance reporting",
  "Create a pet-sitting marketplace for urban neighborhoods",
  "Design a volunteer shift scheduler for nonprofit events",
  "Build a personal finance tracker for freelancers with multi-currency support",
] as const;

export function pickRandomExamplePrompts(count: number): string[] {
  const pool = [...EXAMPLE_PROMPT_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
