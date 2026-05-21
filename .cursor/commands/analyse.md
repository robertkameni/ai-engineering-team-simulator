Follow AGENTS.md.

# /analyse

Analyze {{SCOPE}} with strict focus on observable runtime behavior and verified implementation details.

---

# RULES

Only report:
- real runtime issues
- reachable execution problems
- verifiable architectural inconsistencies

Separate:
- facts
- issues
- opportunities

Do not:
- speculate
- redesign architecture unnecessarily
- report hypothetical edge cases
- duplicate concerns

Focus on:
- runtime correctness
- data flow
- execution safety
- implementation accuracy

---

# OUTPUT

## Scope
What is being analyzed.

## Structure
Factual modules, entry points, dependencies, and execution flow.

## Issues
Only real reachable problems.

Each issue must include:
- affected file/module
- runtime impact
- why it is reachable
- severity

## Dependencies
Only actual dependencies relevant to execution.

## Opportunities
Non-critical improvements only.

Must:
- preserve architecture
- improve maintainability or correctness
- avoid redesigns

## Risk Assessment
Only concrete runtime risks.