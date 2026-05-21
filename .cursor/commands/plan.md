Follow AGENTS.md.

# /plan

Create a step-by-step implementation plan for {{SCOPE}}.

---

# RULES

Plans must:
- solve verified problems
- preserve architecture consistency
- maintain valid runtime behavior
- prioritize root causes first

Avoid:
- speculative work
- unnecessary abstractions
- architecture redesigns
- redundant fixes

Each step must:
- have clear purpose
- preserve system stability
- maintain clean boundaries

---

# OUTPUT

## Goal
One-line objective.

## Prerequisites
Only real requirements.

## Step-by-step Plan

Each step must include:
- affected files/modules
- exact change
- dependency reasoning
- expected runtime effect

## Verification
Observable ways to validate correctness.

## Rollback Strategy
Only if changes introduce meaningful risk.