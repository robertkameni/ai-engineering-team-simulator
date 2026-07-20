# Why round-2 fixes passed unit tests but failed under live load (v3)

## False confidence from unit tests

| Round-2 claim | What the test actually checked | What live models did |
|---|---|---|
| `userWaitMs` telemetry | Merge accepts whatever value callers pass | Caller set `userWaitMs = artifactDurationMs` — tests never asserted `userWaitMs > artifactDurationMs` |
| Context compression | `summarizePriorTurns` on a short fixture | Latest turn kept **verbatim uncapped**; light path kept last **6 full turns** — subscription architect dumps stacked to ~420k peak prompt |
| Meta-spam guard | Exact line `no continuation needed` | Model wrote `I have no continuation needed — …` (prose) — regex required start-of-line exact match |
| Ops follow-up | Near-cap backend escape (`remainingBudget ≤ 3`) | Food/subscription evaluated mid-debate (`remainingBudget > 3`) and still hit `not_architect_correction_after_review` |
| Truncation recovery | Recovery when `remainingBudget >= 2` | Approves near the end skipped recovery; export still showed truncated DevOps/reviewer text |
| Near-cap approve | Only when `remaining ≤ 2` | Subscription burned 15+ min of reject cycles **without** hitting the near-cap window |

## Code paths not covered

1. **`persistArtifactTiming`** — the incorrect `userWaitMs = artifactDurationMs` assignment had no regression test.
2. **`windowTranscriptForTurn` light path** — tests exercised heavy/correction summarization, not the 6-turn verbatim window under multi-10k live turns.
3. **Non-architect ops skip** — tests encoded the skip as intended behavior (`keeps mid-debate backend corrections out of scope`), so the product bug was locked in by the suite.
4. **Continuation meta prose** — only exact/meta-line patterns were tested, not conversational refusals to continue.

## Behaviors that only appear with real model output

- Long architect “Changes” revisions (30k–40k chars) after reviewer rejects.
- Continuation streams that narrate “I have no continuation needed” instead of emitting `NO_CONTINUATION_NEEDED`.
- Reviewer approve with mid-section truncation that still looks “complete enough” until export.
- Six unresolved DevOps issues surviving across backend/frontend correction cycles without an architect correction.

## Remediation principle for future rounds

Every live failure must become a **fixture that fails on pre-fix code**: food-style meta prose, latest-turn 42k dump, mid-debate ops blockers, and `userWaitMs === debate + artifact`. Do not assert implementation details that encode the bug as correct behavior.
