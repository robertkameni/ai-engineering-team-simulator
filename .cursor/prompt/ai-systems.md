# AI Systems Rules

Follow AGENTS.md.

This file defines additional rules for:
- AI orchestration systems
- multi-agent workflows
- streaming pipelines
- memory systems
- LLM runtime correctness
- structured generation flows

These rules apply when working inside:
- /src/ai/*
- /src/app/*
- /src/features/*
- /src/lib/*

---

# CORE PRINCIPLES

AI systems must prioritize:
- deterministic behavior
- runtime correctness
- bounded context
- observable execution
- graceful degradation
- predictable orchestration

Avoid:
- hidden agent behavior
- uncontrolled recursion
- implicit orchestration state
- unbounded memory growth
- opaque prompt chains

---

# AI EXECUTION FLOW

All AI execution must follow explicit boundaries:

UI
→ application layer
→ orchestration layer
→ provider layer

Never:
- call providers directly from UI
- inline orchestration inside components
- mix persistence with prompt construction

---

# AGENT SYSTEM RULES

Agents are coordinated systems, not isolated chat completions.

Agents must:
- receive scoped context
- operate with explicit responsibilities
- produce structured outputs
- preserve deterministic orchestration flow

Avoid:
- overlapping agent responsibilities
- uncontrolled context sharing
- duplicated orchestration logic
- hidden prompt mutations

Prefer:
- typed agent contracts
- isolated execution stages
- explicit orchestration sequencing
- composable orchestration flows

---

# ORCHESTRATION RULES

Orchestration must remain:
- observable
- debuggable
- deterministic
- replayable where possible

Prefer:
- explicit orchestration pipelines
- step-based execution
- event-driven flow
- isolated orchestration state

Avoid:
- deeply nested orchestration
- hidden side effects
- recursive agent execution
- implicit execution ordering

---

# PROMPT ENGINEERING RULES

Prompts must be:
- modular
- versionable
- composable
- deterministic

Never:
- inline large prompts in runtime logic
- duplicate prompt templates
- mix formatting logic with orchestration

Prefer:
- dedicated prompt modules
- structured prompt builders
- reusable prompt sections
- centralized system prompts

---

# STRUCTURED OUTPUT RULES

Always prefer:
- schema-validated outputs
- typed responses
- deterministic parsing

Use:
- Zod schemas
- structured generation
- safe parsing
- explicit validation

Never trust:
- raw LLM JSON
- implicit formatting assumptions
- unvalidated AI output

All AI output must be treated as untrusted input.

---

# CONTEXT MANAGEMENT RULES

Context must remain:
- bounded
- relevant
- intentional

Avoid:
- injecting full history blindly
- duplicated context blocks
- uncontrolled transcript growth
- irrelevant retrieval results

Prefer:
- scoped retrieval
- relevance filtering
- summarized history
- token-aware context assembly

---

# TOKEN MANAGEMENT RULES

Optimize for:
- bounded token usage
- predictable context windows
- efficient retrieval

Avoid:
- oversized prompts
- duplicated instructions
- unnecessary transcript replay
- excessive system prompt stacking

Prefer:
- reusable prompt fragments
- compact structured context
- incremental context assembly

---

# MEMORY SYSTEM RULES

Memory systems must:
- preserve relevance
- avoid duplication
- support scoped retrieval
- remain deterministic

Prefer:
- semantic retrieval
- scoped embeddings
- relevance ranking
- bounded memory windows

Avoid:
- global unfiltered retrieval
- duplicate embeddings
- uncontrolled memory accumulation

---

# STREAMING RULES

Streaming systems must:
- degrade gracefully
- preserve ordering
- handle partial failures
- remain interrupt-safe

Prefer:
- incremental event streaming
- isolated stream state
- explicit completion events
- deterministic event flow

Avoid:
- hidden stream mutations
- mixed transport concerns
- blocking generation flows

---

# RETRY RULES

Retries must be:
- explicit
- bounded
- observable

Never:
- retry infinitely
- retry invalid requests
- duplicate side effects blindly

Prefer:
- retry only transient failures
- idempotent persistence flows
- bounded retry counts

---

# PERSISTENCE RULES

AI persistence flows must avoid:
- partial writes
- inconsistent state
- mixed completion semantics

Prefer:
- transactional persistence
- atomic writes where appropriate
- explicit completion states
- failure-safe orchestration

Generated state must never appear complete if persistence partially failed.

---

# FAILURE HANDLING RULES

AI systems must fail predictably.

Always:
- surface generation failures clearly
- preserve debuggability
- separate provider failures from parsing failures
- distinguish partial vs complete failure

Avoid:
- swallowing generation errors
- hidden retries
- silent parsing fallback loops

---

# PROVIDER RULES

Provider integrations must:
- remain isolated
- support swapping providers
- avoid provider-specific leakage

Prefer:
- provider abstraction layers
- centralized model configuration
- isolated provider utilities

Never:
- spread provider SDK logic across the codebase
- hardcode provider-specific assumptions into orchestration

---

# CONCURRENCY RULES

Concurrency must remain:
- intentional
- bounded
- observable

Avoid:
- uncontrolled parallel generation
- race-prone shared state
- hidden async orchestration

Prefer:
- explicit concurrency boundaries
- isolated execution state
- deterministic sequencing where correctness matters

---

# AI ANALYSIS RULES

When analyzing AI systems:

Focus on:
- reachable runtime behavior
- orchestration correctness
- persistence consistency
- context management
- stream lifecycle correctness
- structured output safety
- retry correctness
- token growth risks

Avoid:
- speculative hallucination fears
- generic "AI safety" commentary
- theoretical distributed-system concerns
- infrastructure redesign suggestions

Only report:
- observable runtime risks
- reachable orchestration failures
- persistence inconsistencies
- parsing correctness problems
- stream lifecycle bugs

---

# PERFORMANCE RULES

Optimize for:
- predictable latency
- efficient context usage
- streaming responsiveness
- bounded orchestration cost

Avoid:
- unnecessary generation passes
- duplicated retrieval
- oversized prompts
- repeated parsing work

---

# OUTPUT RULES

AI-generated outputs must:
- remain schema-safe
- preserve deterministic formatting
- avoid hidden assumptions
- degrade gracefully on failure

Never expose:
- chain-of-thought
- hidden reasoning
- internal orchestration prompts
- provider internals