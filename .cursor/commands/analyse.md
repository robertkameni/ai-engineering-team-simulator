# /analyse

Follow AGENTS.mdc

Analyze {{SCOPE}} with strict focus on observable runtime correctness and reachable execution behavior.

---

# OBJECTIVE

Determine whether the current implementation contains meaningful runtime risks.

The goal is correctness verification, not issue discovery.

It is valid to conclude:
- no meaningful runtime issues found
- execution flow is runtime-safe
- current safeguards are sufficient

---

# RULES

Only report:
- observable runtime failures
- reachable execution problems
- persistence inconsistencies
- missing failure handling in active code paths

Do not:
- speculate
- report theoretical concerns
- search for edge cases without evidence
- suggest architectural redesigns
- report style or preference concerns
- duplicate mitigated concerns

Respect:
- existing safeguards
- deployment constraints
- current runtime behavior

---

# EVIDENCE RULE

Only state conclusions supported by:
- observable control flow
- reachable execution paths
- explicit framework behavior
- verified persistence behavior

Do not infer hidden runtime behavior without evidence.

---

# ISSUE THRESHOLD

Do not report an issue unless:

1. the runtime path is reachable
2. the impact is observable
3. existing code does not already mitigate it
4. the issue affects actual runtime correctness

If mitigation already exists:
- do not re-report the concern

---

# SUFFICIENCY RULE

Once:
- runtime paths are protected
- persistence remains consistent
- failures are handled appropriately

prefer concluding correctness over searching for additional concerns.

---

# ZERO-ISSUE VALIDATION

It is expected and acceptable to conclude:

- no meaningful runtime issues detected
- no additional reachable risks found
- implementation is operationally correct

Do not continue searching for issues once correctness is established.

---

# SEVERITY RULES

High
- runtime crash
- persistent invalid state
- security exposure
- corrupted persistence

Medium
- inconsistent persisted state
- degraded visible behavior
- partial execution failure

Low
- observable but low-impact runtime inconsistency

---

# OUTPUT

## Scope
What is being analyzed.

## Structure
Factual runtime modules, entry points, and execution flow only.

## Issues
Only meaningful reachable runtime problems.

Each issue must include:
- affected file/module
- runtime impact
- why reachable
- severity

If no meaningful runtime issues exist:
- explicitly state that none were found

## Dependencies
Only execution-relevant dependencies.

## Risk Assessment
Only concrete reachable runtime risks.