---
id: LORE-110
title: >-
  Cap probeLiveness's total URL count and wall-clock time, not just per-URL
  concurrency
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
probeLiveness (src/commands/check.ts:764-787) builds `uniqueUrls` from the entire worklist and probes them via `mapWithConcurrency(uniqueUrls, LIVENESS_CONCURRENCY, ...)`, but only two per-item bounds exist: LIVENESS_CONCURRENCY=8 (check.ts:730) and LIVENESS_TIMEOUT_MS=5000 per request (check.ts:728). There is no cap on the total number of distinct URLs probed and no overall deadline/AbortController for the whole probe pass, so a bundle with tens of thousands of distinct external links will still enqueue and probe every one of them, bounded only by concurrency times per-request timeout, making `lore check --external` take arbitrarily long on a large bundle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 probeLiveness enforces an explicit ceiling on the run — either a maximum number of distinct URLs probed or an overall wall-clock deadline for the whole pass — documented alongside LIVENESS_CONCURRENCY/LIVENESS_TIMEOUT_MS.
- [ ] #2 When the worklist exceeds the new limit, the excess is handled in a defined, tested way (e.g. skipped with an advisory finding) rather than silently probing an unbounded number of URLs.
- [ ] #3 A test constructs a worklist larger than the new cap and asserts probeLiveness completes within a bounded time/does not probe more than the cap's worth of distinct URLs.
<!-- AC:END -->
