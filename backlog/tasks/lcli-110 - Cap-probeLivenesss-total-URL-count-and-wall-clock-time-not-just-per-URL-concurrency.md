---
id: LCLI-110
title: >-
  Cap probeLiveness's total URL count and wall-clock time, not just per-URL
  concurrency
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:25'
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
- [x] #1 probeLiveness enforces an explicit ceiling on the run — either a maximum number of distinct URLs probed or an overall wall-clock deadline for the whole pass — documented alongside LIVENESS_CONCURRENCY/LIVENESS_TIMEOUT_MS.
- [x] #2 When the worklist exceeds the new limit, the excess is handled in a defined, tested way (e.g. skipped with an advisory finding) rather than silently probing an unbounded number of URLs.
- [x] #3 A test constructs a worklist larger than the new cap and asserts probeLiveness completes within a bounded time/does not probe more than the cap's worth of distinct URLs.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a LIVENESS_MAX_URLS constant (documented alongside LIVENESS_CONCURRENCY/LIVENESS_TIMEOUT_MS) capping the number of distinct URLs probeLiveness will actually probe.
2. In probeLiveness, split uniqueUrls into probed (first N) and skipped (rest); only run mapWithConcurrency over the probed slice.
3. For every (file, url) whose url was skipped, emit an advisory external-link finding ('was not probed: exceeded the liveness cap of N distinct URLs') instead of silently dropping it, reusing the existing failure-message/finding shape.
4. Add a test in test/check.test.ts that builds a worklist of unique URLs well beyond the cap, asserts the fetch fake is called fewer times than the worklist size (proves the cap is enforced), asserts the excess produces 'was not probed'/'exceeded' advisory findings, and asserts the whole run completes within a small bounded time.
5. Verify with bun test test/check.test.ts, bun run typecheck, and full bun test suite (no new failures vs base).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added LIVENESS_MAX_URLS=500 cap in src/commands/check.ts, documented next to LIVENESS_CONCURRENCY/LIVENESS_TIMEOUT_MS. probeLiveness now probes only the first 500 distinct URLs (first-seen order) and reports every URL beyond the cap as its own advisory external-link finding ('was not probed: exceeded the liveness cap of 500 distinct URLs') instead of enqueueing it, so the total worklist size (not just per-URL concurrency/timeout) is bounded. Added test/check.test.ts test 'LCLI-110: probeLiveness caps the number of distinct URLs...' with an 800-URL worklist: asserts fewer than 800 fetches happen, elapsed time stays well under 5s, and the skipped count matches the advisory-finding count exactly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
probeLiveness (src/commands/check.ts) now enforces LIVENESS_MAX_URLS=500 as a ceiling on distinct URLs probed per --external run, documented alongside LIVENESS_CONCURRENCY/LIVENESS_TIMEOUT_MS. URLs beyond the cap are skipped and surfaced as advisory external-link findings ('was not probed: exceeded the liveness cap...') rather than silently probed/dropped. Verified via: bun test test/check.test.ts (194 pass, including new LCLI-110 test with an 800-URL worklist proving fetchCalls < 800 and skipped-count == advisory-finding count), bun run typecheck (clean), full bun test (1698 pass / 0 fail), and bun run lint (no findings in touched files).
<!-- SECTION:FINAL_SUMMARY:END -->
