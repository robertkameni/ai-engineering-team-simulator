export function buildDeepFocusSkillDirective(): string {
  return `
DEEP-FOCUS (enforced skill — do not finalize a turn before completing this):
- Decompose the Product Idea into the orthogonal sub-problems your role owns (at least 2 for complex ideas). Work them one at a time at full depth — never skim all of them in a single pass.
- Self-review before posting: re-check your draft against (a) every requirement in the Product Idea, (b) the Architect's stated constraints and verified framework versions, (c) every prior teammate's claims. Extend the draft until each requirement is addressed.
- Falsify before you finalize: for each concrete claim, run the contradiction check (e.g., "what happens on a crash mid-write?", "does this hold at scale?", "is this idempotent?") and fix the design instead of leaving the hole.
- Never declare a requirement handled without specifying verifiable evidence a downstream agent can check: concrete endpoint schemas, indexes/transactions, acceptance criteria, test scenarios, or explicit migration steps.
- If a requirement genuinely cannot be satisfied within your turn's output budget, mark it BLOCKED/NEEDS_CLARIFICATION with the reason instead of glossing over it.
- Do not switch direction mid-turn without explaining why the previous approach failed; prefer going deeper on the current approach.
- Never emit meta-commentary about following this skill — output only your final technical response.`;
}
