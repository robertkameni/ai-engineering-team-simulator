import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractReviewerConcerns,
  validateCorrectionTurn,
} from "@/ai/orchestration/validate-correction-turn";

describe("validateCorrectionTurn", () => {
  it("accepts a correction turn that substantively changes the original", () => {
    const previous = `
## Data & APIs
The system uses a shared BullMQ queue for all providers: Slack, Google, Teams.
Workers pull jobs from this single queue.

## Backend Risks
- Race conditions in the outbox processor — needs a poller with row-level locking.
- Worker starvation when Slack jobs dominate the queue.

## Stack
Node.js 22, Express, Prisma, PostgreSQL, Redis.
`;

    const correction = `
## Changes

**Disagree — shared BullMQ queue causes worker starvation.**

Replaced with per-provider queues (SlackQueue, GoogleQueue, TeamsQueue) to isolate workloads.
- Added provider-specific concurrency limits: Slack=5, Google=3, Teams=3.
- Worker pools are provisioned per queue via Kubernetes.
- Monitoring alert thresholds are set per queue, not globally.

## Backend Risks
- Outbox processor uses SELECT ... FOR UPDATE SKIP LOCKED for row-level locking.
- Added rate-limit token bucket per provider to protect external APIs.
- Backup verification via nightly pg_restore dry-run.
`;

    const feedback = `
## Review
**Disagree** — shared BullMQ queue causes worker starvation. Per-provider queues needed.

**2. Outbox polling — Risk**
The outbox processor must use row-level locking to prevent duplicate delivery. UNRESOLVED.

[REJECT: backend]
`;

    const result = validateCorrectionTurn(previous, correction, feedback, "backend");

    assert.equal(result.isValid, true, `Expected valid correction, got: ${result.failureReason}`);
    assert.ok(result.textSimilarity < 0.70, `Similarity too high: ${result.textSimilarity.toFixed(2)}`);
    assert.equal(result.addressesReviewerFeedback, true);
  });

  it("rejects a correction turn that is nearly identical to the original", () => {
    const previous = `
## Data & APIs
The system uses a shared BullMQ queue. Workers pull jobs from this queue.
## Backend Risks
- Race conditions in the outbox processor.
`;

    const correction = `
## Data & APIs
The system uses a shared BullMQ queue for processing. Workers pull jobs from this single queue.

## Backend Risks
- Race conditions in the outbox processor — needs a poller.
`;

    const feedback = `
**Disagree** — shared queue causes starvation. Use per-provider queues.
[REJECT: backend]
`;

    const result = validateCorrectionTurn(previous, correction, feedback, "backend");

    assert.equal(result.isValid, false);
    assert.ok(
      result.failureReason.includes("similar") || result.failureReason.includes("overlap"),
      `Expected similarity failure, got: ${result.failureReason}`,
    );
    assert.ok(result.textSimilarity > 0.70);
  });

  it("rejects a correction turn that is too short", () => {
    const previous = `
## Architecture
A full multi-page architecture plan with 10 sections.
## Data Model
Users, groups, expenses, settlements with full schema.
## APIs & Integration
REST API with 15 endpoints.
## Decisions & Risks
Detailed trade-off analysis spanning 500+ words.
`;

    const correction = "## Changes\n\nFixed the queue issue.";

    const feedback = `
**Disagree** — shared queue causes starvation.
[REJECT: backend]
`;

    const result = validateCorrectionTurn(previous, correction, feedback, "backend");

    assert.equal(result.isValid, false);
    assert.ok(
      result.failureReason.includes("short") || result.failureReason.includes("char"),
      `Expected shortness failure, got: ${result.failureReason}`,
    );
  });

  it("rejects a correction with high similarity that does not address reviewer concerns", () => {
    const previous = `
## Architecture
Event-driven system using RabbitMQ for async messaging.
PostgreSQL for persistence with a shared connection pool.

## Data & APIs
REST API with POST /orders, GET /orders/:id endpoints.

## Backend Risks
- RabbitMQ broker is a single point of failure.
- Payment processing has no idempotency key — double-charge risk.
- Shared PostgreSQL connection pool causes noisy-neighbor latency.
`;

    const correction = `
## Architecture
Event-driven system using RabbitMQ for async messaging between services.
PostgreSQL for persistence with a shared connection pool across all tenants.

## Data & APIs
REST API with POST /orders, GET /orders/:id endpoints.

## Backend Risks
- RabbitMQ broker is a single point of failure with no failover strategy.
- Payment processing continues without idempotency key.
- Shared PostgreSQL connection pool may cause latency issues.
`;

    const feedback = `
**Disagree** — RabbitMQ needs queue-per-domain isolation, not single broker.
**Disagree** — Payment processing lacks idempotency guard despite double-charge risk.
[REJECT: backend]
`;

    const result = validateCorrectionTurn(previous, correction, feedback, "backend");

    assert.equal(result.isValid, false, `Expected invalid, got valid. Reason: ${result.failureReason || 'none'}`);
    assert.ok(result.textSimilarity > 0.65, `Similarity too low: ${result.textSimilarity.toFixed(2)}`);
  });

  it("accepts a correction that uses matching terminology to address reviewer concerns", () => {
    const previous = `
## Architecture
Event-driven with RabbitMQ, PostgreSQL, Redis.

## Backend Risks
- RabbitMQ broker is a single point of failure.
- Payment processing has no idempotency key.
- No dead-letter queue for failed events.
`;

    const correction = `
## Changes

**Per-provider queues**: Replaced single RabbitMQ exchange with three dedicated queues (email, payment, notification), each with independent dead-letter queue and isolation.

**Idempotency**: Added idempotency_key (UUID v7) column to payments table to prevent duplicate charges.

**Dead-letter queue**: Added dead-letter queue with exponential backoff and Prometheus alert.

The core data model (Users, Orders, Payments) remains unchanged.
`;

    const feedback = `
**Disagree** — RabbitMQ needs queue isolation and dead-letter queue for failures.
**Disagree** — Payment processing lacks idempotency to prevent duplicate charges.
[REJECT: backend]
`;

    const result = validateCorrectionTurn(previous, correction, feedback, "backend");

    assert.equal(result.isValid, true, `Expected valid, got: ${result.failureReason}`);
    assert.equal(result.addressesReviewerFeedback, true);
  });
});

describe("extractReviewerConcerns", () => {
  it("extracts numbered disagree items from reviewer feedback", () => {
    const feedback = `
## Review
1. **Queue architecture** worker starvation under multi-provider load.
2. **Backup strategy** no automated backup verification planned.
`;

    const concerns = extractReviewerConcerns(feedback);

    assert.ok(concerns.length >= 1, `Expected at least 1 concern, got ${concerns.length}`);
    assert.ok(
      concerns.some((c) => c.includes("worker") || c.includes("starvation") || c.includes("Queue")),
      `Concerns: ${JSON.stringify(concerns)}`,
    );
  });

  it("extracts UNRESOLVED markers", () => {
    const feedback = `
## Review
UNRESOLVED — session expiry warning is not implemented on the client side.
**Disagree** — the outbox claimed_by pattern creates unclaimed rows under concurrent load.
`;

    const concerns = extractReviewerConcerns(feedback);

    assert.equal(concerns.length >= 2, true);
    assert.ok(concerns.some((c) => c.toLowerCase().includes("session")));
    assert.ok(concerns.some((c) => c.toLowerCase().includes("outbox")));
  });

  it("returns empty array for trivial feedback", () => {
    const concerns = extractReviewerConcerns("Good job team. [APPROVE]");

    assert.equal(concerns.length, 0);
  });

  it("deduplicates identical concerns", () => {
    const feedback = `
**Disagree** queue starvation
**Disagree** queue starvation
`;

    const concerns = extractReviewerConcerns(feedback);

    assert.equal(concerns.length, 1);
  });
});
