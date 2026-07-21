---
id: LORE-112
title: >-
  check's JSON report doesn't mark itself incomplete when reconciliation errors
  mid-run
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
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In runCheck's non-external branch (src/commands/check.ts:186-194), when `driftPromise` resolves with a non-null `error` (a per-root reconciliation failure), the code still calls `emit(reportRenderable(report), ...)` with the findings collected so far, and only rethrows `error` afterward. The emitted report object is identical in both the error and no-error cases, and `CheckReport` (src/core/check.ts:96-118) has no `complete`/status field, so a JSON consumer that reads only stdout (without also checking the process exit code or catching the rejection) cannot distinguish a partial-failure report from a genuinely clean, complete run — even when errorCount is 0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CheckReport (or its JSON envelope) gains a field, e.g. `complete: boolean`, that is false whenever `driftPromise`'s error is non-null and true otherwise.
- [ ] #2 A test drives runCheck with a driftPromise/computeDriftFindings stub that resolves with a non-null error and asserts the emitted report has `complete: false` even when errorCount is 0, distinguishing it from a clean run's `complete: true`.
<!-- AC:END -->
