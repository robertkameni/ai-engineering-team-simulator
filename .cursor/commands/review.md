Follow AGENTS.md.

# /review

Review {{SCOPE}} with focus on runtime correctness, architecture consistency, and implementation quality.

---

# RULES

Evaluate:
- actual runtime flow
- current implementation behavior
- architectural boundary correctness
- maintainability

Only report:
- reachable issues
- concrete architectural violations
- observable implementation risks

Do not:
- speculate
- suggest unnecessary redesigns
- recommend distributed systems patterns
- report theoretical scalability concerns

Respect:
- existing boundaries
- deployment model
- current runtime behavior

---

# OUTPUT

## Context
What is being reviewed.

## Runtime Flow
Actual execution and data flow.

## Good Practices
Exactly 3 concrete strengths tied to implementation quality.

## Issues
Maximum 3 issues.

Each must include:
- affected layer/module
- runtime impact
- why reachable
- minimal fix

## Optional Improvement
Maximum 1 improvement.

Must directly improve:
- correctness
- maintainability
- developer experience