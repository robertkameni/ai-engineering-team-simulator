Follow AGENTS.md.

# /plan

Create a step-by-step implementation plan for {{SCOPE}}.

---

# OBJECTIVE

Produce a focused implementation plan that:
- preserves runtime correctness
- maintains architecture boundaries
- minimizes unnecessary change
- keeps the system operational throughout implementation

---

# RULES

Plans must:
- solve the requested objective directly
- preserve existing runtime behavior unless intentionally changing it
- prioritize root causes before downstream fixes
- maintain implementation clarity
- minimize integration risk

Only include:
- necessary implementation steps
- concrete runtime-relevant changes
- justified sequencing decisions

Do not:
- speculate
- over-engineer solutions
- redesign architecture unnecessarily
- introduce abstractions without clear justification
- include unrelated cleanup work
- recommend distributed-system patterns

---

# SCOPE DISCIPLINE

Only plan changes directly required for the requested outcome.

Avoid:
- broad rewrites
- speculative future-proofing
- unnecessary infrastructure changes
- unrelated refactors

Prefer focused implementation scope.

---

# SEQUENCING RULE

Steps must:
- preserve valid runtime behavior
- avoid broken intermediate states
- establish dependencies before dependent changes
- minimize implementation risk during rollout

Fix root causes before downstream symptoms.

---

# IMPLEMENTATION RESTRAINT

Prefer:
- incremental improvements
- focused modifications
- reuse of existing infrastructure
- minimal surface-area changes

Avoid introducing:
- unnecessary layers
- generic abstractions
- excessive utilities
- architectural reshaping
without runtime justification.

---

# VERIFICATION RULE

Verification must rely on:
- observable runtime behavior
- actual execution flow
- visible API/UI outcomes
- persistence correctness where relevant

Avoid vague or theoretical verification steps.

---

# OUTPUT

## Goal
One-line implementation objective.

## Prerequisites
Only actual requirements.

## Step-by-step Plan

Each step must include:
- affected files/modules
- exact change
- dependency reasoning
- expected runtime effect

## Verification
Concrete observable validation steps.

## Rollback Strategy
Only if changes introduce meaningful runtime risk.