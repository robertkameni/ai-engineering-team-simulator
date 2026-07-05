# /review

Follow AGENTS.mdc

Review {{SCOPE}} with focus on:
- runtime correctness
- architecture boundary correctness
- implementation quality
- maintainability

---

# RULES

Evaluate:
- actual runtime flow
- reachable execution paths
- current implementation behavior
- layer responsibility correctness

Only report:
- reachable issues
- concrete implementation risks
- observable architectural violations

Do not:
- speculate
- report theoretical concerns
- suggest unnecessary redesigns
- recommend distributed-system patterns
- duplicate concerns already mitigated elsewhere

Respect:
- existing architecture boundaries
- deployment constraints
- current runtime behavior

---

## EVIDENCE RULE

Only state conclusions supported by:
- observable runtime behavior
- reachable execution paths
- explicit control flow
- verified framework behavior

Do not infer hidden behavior without evidence.

---

## ISSUE THRESHOLD

Do not report an issue unless:
1. the runtime path is reachable
2. the impact is observable
3. the current implementation does not already mitigate it

---

## SEVERITY RULES

High
- runtime crash
- persistent invalid state
- security exposure
- core execution failure

Medium
- inconsistent persisted state
- degraded user-visible behavior
- partial execution failure

Low
- maintainability risk
- developer-facing inconsistency
- low-impact edge-case behavior

---

# OUTPUT

## Context
What is being reviewed.

## Runtime Flow
Actual execution and data flow.

## Good Practices
Exactly 5 concrete strengths tied to implementation quality.

## Issues
Maximum 5 issues.

Each issue must include:
- affected layer/module
- runtime impact
- why reachable
- severity
- best recommended fix

## Optional Improvement
Maximum 3 improvement.

Must directly improve:
- correctness
- maintainability
- developer experience