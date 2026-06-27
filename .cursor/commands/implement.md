# /implement

Follow AGENTS.mdc

Implement {{SCOPE}} using production-grade code and current best practices.

---

# OBJECTIVE

Deliver runtime-safe, maintainable implementations that integrate cleanly with the existing system.

Prioritize:
- correctness
- simplicity
- maintainability
- consistency
- bounded scope

---

# RULES

Always:
- preserve architecture boundaries
- write fully working implementations
- prioritize readability
- optimize for maintainability
- use strong typing
- validate external input
- follow DRY and KISS
- preserve runtime correctness

Prefer:
- explicit logic
- deterministic behavior
- focused modules
- composition over inheritance
- server-first architecture
- incremental improvements

Avoid:
- placeholder code
- TODO implementations
- speculative abstractions
- duplicated logic
- oversized files
- unsafe runtime assumptions
- unnecessary rewrites

---

# SCOPE DISCIPLINE

Only modify code directly required for the requested task.

Avoid:
- unrelated refactors
- broad architectural rewrites
- unnecessary file movement
- touching stable code without runtime justification

Prefer minimal targeted changes.

---

# COMPLETENESS RULE

Implementations must include:
- integration with existing flow
- required validation
- failure handling relevant to runtime behavior
- correct imports
- complete typing
- production-safe execution paths

Do not leave partially integrated functionality.

---

# CONSISTENCY RULE

Prefer existing project patterns when they are:
- runtime-safe
- maintainable
- aligned with AGENTS.md

Do not introduce competing patterns unnecessarily.

---

# IMPLEMENTATION RESTRAINT

Prefer:
- focused implementations
- small surface-area changes
- incremental improvements

Avoid introducing:
- unnecessary layers
- speculative abstractions
- excessive utilities
- generic helper sprawl

Reuse only when duplication is concrete and recurring.

---

# IMPLEMENTATION SAFETY

Do not invent:
- framework APIs
- SDK behavior
- undocumented features
- inferred runtime guarantees

If implementation details are uncertain:
- use official documented behavior
- choose safest stable approach
- avoid speculative code paths

---

# OUTPUT

In task mode:
- implement directly
- output production-ready code
- keep explanations concise
- explain only important runtime decisions
- avoid long summaries unless requested
- always keep up-to-date all documentation files