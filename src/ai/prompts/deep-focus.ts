export function buildDeepFocusSkillDirective(): string {
  return `
DEEP-FOCUS (enforced skill — do not finalize a turn before completing this):
- Decompose the Product Idea into the orthogonal sub-problems your role owns (at least 2 for complex ideas). Work them one at a time at full depth — never skim all of them in a single pass.
- Self-review before posting: re-check your draft against (a) every requirement in the Product Idea, (b) the Architect's stated constraints and verified framework versions, (c) every prior teammate's claims. Close each requirement within your role's hard output ceiling — depth beats length; if everything cannot fit, cover the highest-impact items and mark the rest BLOCKED.
- Falsify before you finalize: for each concrete claim, run the contradiction check (e.g., "what happens on a crash mid-write?", "does this hold at scale?", "is this idempotent?") and fix the design instead of leaving the hole.
- Never declare a requirement handled without specifying verifiable evidence a downstream agent can check: concrete endpoint schemas, indexes/transactions, acceptance criteria, test scenarios, or explicit migration steps.
- Machine tags are required, not optional commentary. After the PM's first turn, every later role must include at least one \`[CHALLENGE: architect]\` or \`[CHALLENGE: Casey]\` (role slug or teammate display name) targeting someone who already spoke; use \`[EVIDENCE: mechanism]\` when you claim a capability is tested, verified, or automated (job name, test, or drill); use \`[BLOCKED: topic]\` when you cannot satisfy a requirement in this turn.
- Never state that a capability is tested, verified, automated, or already in place unless the draft includes \`[EVIDENCE: …]\` or \`[BLOCKED: …]\`. An assertion such as "restore tested monthly" with no evidence tag is an unverified claim.
- Do not switch direction mid-turn without explaining why the previous approach failed; prefer going deeper on the current approach.
- Never emit meta-commentary about following this skill. The three tags above are the only allowed skill markers — output only your final technical response.`;
}
