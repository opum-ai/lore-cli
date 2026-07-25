---
id: LORE-266
title: >-
  lore agents: the pre-write symlink sweep (LORE-93 AC#5) has zero test coverage
  — deleting assertNoSymlinkInAnyPath fails no test
status: To Do
assignee: []
created_date: '2026-07-25 18:16'
labels:
  - security
  - test-coverage
  - cmd-crud-a
dependencies: []
priority: low
type: bug
ordinal: 368000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
The `assertNoSymlinkInAnyPath` sweep in the agent-bridge write path should be pinned by a regression test, so the LORE-93 AC#5 invariant (refuse the whole run if ANY target path is a symlink, BEFORE the first write) cannot be silently removed.

## Observed
Found during the LORE-260 review by mutation testing. Deleting the `assertNoSymlinkInAnyPath(root, targets)` call from the agent-bridge write path produces **0 test failures** — on `dev` as well as on the LORE-260 branch. It is therefore pre-existing, NOT introduced by LORE-260.

A live symlink test still exits 5 today, but only because `ensureDir`'s own per-call guard catches it **reactively**, one path at a time. That is a different, weaker property than the one LORE-93 AC#5 established: sweep every target up front and refuse before writing anything. With the sweep gone, a run with a symlink on the *second* target would write the *first* file before failing — a partial application the sweep exists to prevent.

## Why it matters
This queue is itself the follow-up backlog of a security/robustness review, and symlink escape is one of its recurring classes (LORE-76, LORE-77, LORE-79, LORE-91, LORE-93, LORE-94). An untested security guard is one refactor away from silently disappearing — and the LORE-260 fold-in refactored exactly this code path, which is how the gap surfaced.

## Direction (decide in plan)
Add a regression test that plants a symlink at the SECOND bridge target and asserts (a) the run refuses with exit 5, and (b) the FIRST target was never written — the second assertion is what distinguishes the up-front sweep from `ensureDir`'s reactive guard. Consider whether the same gap exists for other multi-target sweeps.

## Refs
src/commands/agents.ts / src/core/agent-bridge.ts (`assertNoSymlinkInAnyPath`), test/agents.test.ts, LORE-93 (Done — established the invariant), LORE-76/LORE-263 (symlink guard must never be bypassed by an idempotent skip).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A regression test plants a symlink at a NON-FIRST agent-bridge target and asserts the run refuses with exit 5 AND that no earlier target file was written — distinguishing the up-front sweep from ensureDir's reactive per-call guard.
- [ ] #2 Deleting or neutering assertNoSymlinkInAnyPath causes that test to fail (verified by an explicit mutation check recorded in the task notes).
- [ ] #3 Any other multi-target pre-write sweep with the same gap is identified and either covered or explicitly noted as out of scope.
- [ ] #4 Full suite + lore check stay green; no behavior change.
<!-- AC:END -->
