# AGENTS.md

# AI Engineering Team Simulator

## PURPOSE

This project is a production-grade AI-native engineering simulation platform built with modern TypeScript infrastructure.

The system simulates collaborative AI software engineering agents through:
- orchestration pipelines
- realtime streaming
- structured AI outputs
- memory systems
- event-driven workflows
- server-first architecture

The codebase must prioritize:
- correctness
- maintainability
- simplicity
- deterministic behavior
- production-grade architecture

---

# ENGINEERING PRINCIPLES

## Priority Order

When tradeoffs exist, prioritize:

1. Runtime correctness
2. Simplicity (KISS)
3. Maintainability
4. Readability
5. DRY
6. Performance optimization

Never sacrifice correctness for abstraction.

---

## D.R.Y.

Eliminate unnecessary duplication.

Prefer:
- shared utilities
- reusable domain logic
- centralized schemas
- composable modules

Avoid:
- duplicated orchestration logic
- repeated validation logic
- repeated prompt logic
- copy-pasted implementations

Abstract only after repetition becomes clear.

---

## K.I.S.S.

Prefer the simplest correct implementation.

Avoid:
- premature abstractions
- speculative architecture
- unnecessary indirection
- overengineered systems

Prefer:
- explicit flows
- focused modules
- predictable behavior
- readable code

---

# HALLUCINATION PREVENTION

All outputs must align with:
- official documentation
- latest stable APIs
- verified framework behavior
- observable runtime constraints

Never:
- invent APIs
- fabricate SDK methods
- assume undocumented behavior
- use deprecated patterns

If uncertain:
- state uncertainty briefly
- use safest verified approach
- prefer official patterns

---

# TECHNOLOGY RULES

Always use:
- latest stable versions
- official best practices
- modern framework patterns

Never use:
- deprecated APIs
- legacy framework patterns
- outdated tutorials

---

# NEXT.JS RULES

Use:
- App Router
- Server Components by default
- Route Handlers
- Server Actions where appropriate
- streaming-first architecture
- Suspense boundaries intentionally

Prefer:
- server-first data fetching
- minimal client JavaScript
- colocated route logic

Avoid:
- unnecessary client components
- client waterfalls
- duplicated fetching

---

# TYPESCRIPT RULES

Must use:
- strict mode
- explicit typing
- discriminated unions
- exhaustive checks
- schema validation

Avoid:
- any
- unsafe casting
- implicit runtime assumptions

---

# DATABASE RULES

Use:
- PostgreSQL
- Prisma
- optimized queries
- explicit relations
- transactional correctness

Avoid:
- N+1 queries
- hidden query costs
- unbounded reads

---

# AI SYSTEM RULES

All AI execution must flow through:

UI
→ application layer
→ orchestration layer
→ provider layer

Never call LLM providers directly from UI components.

Agents must:
- maintain structured memory
- reference prior context
- produce typed outputs
- support deterministic orchestration

---

# ARCHITECTURE RULES

Use clean boundaries:

/ui
/application
/domain
/infrastructure
/ai
/orchestration

Rules:
- UI never accesses infrastructure directly
- domain remains framework-agnostic
- orchestration owns AI coordination
- infrastructure owns external services

---

# REALTIME RULES

Realtime systems must:
- degrade gracefully
- reconnect safely
- avoid duplicate events
- remain event-driven

Prefer:
- streaming UX
- optimistic updates
- isolated realtime state

---

# PERFORMANCE RULES

Prioritize:
- streaming UX
- low bundle size
- parallel execution
- cache-aware architecture
- server-side computation

Avoid:
- unnecessary hydration
- sequential waterfalls
- oversized client state

---

# SECURITY RULES

Always:
- validate external input
- validate AI output
- sanitize user content
- enforce authorization boundaries

Never trust:
- model outputs
- uploaded content
- client input

---

# OUTPUT RULES

Never expose:
- chain-of-thought
- hidden reasoning
- internal analysis
- meta commentary

Output only:
- final answers
- final code
- concise explanations when necessary

---

# RESPONSE MODES

## Conversation Mode

Default mode for:
- questions
- discussions
- architecture analysis
- planning

Keep responses:
- concise
- technically accurate
- natural

---

## Task Mode

Activate only when explicitly asked to:
- implement
- build
- fix
- refactor
- create code

In task mode:
- begin implementation immediately
- optimize for production quality
- minimize explanations