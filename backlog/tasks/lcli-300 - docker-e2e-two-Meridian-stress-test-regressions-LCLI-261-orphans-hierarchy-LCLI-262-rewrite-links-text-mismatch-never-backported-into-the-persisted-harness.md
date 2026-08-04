---
id: LCLI-300
title: >-
  docker/e2e: two Meridian-stress-test regressions (LCLI-261 orphans hierarchy,
  LCLI-262 rewrite-links text mismatch) never backported into the persisted
  harness
status: To Do
assignee: []
created_date: '2026-08-04 04:10'
updated_date: '2026-08-04 04:10'
labels:
  - e2e
  - testing
  - orphans
  - rewrite-links
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies:
  - LCLI-261
  - LCLI-262
references:
  - docker/e2e/run-e2e.sh
  - src/commands/orphans.ts
  - src/core/rewrite.ts
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: medium
ordinal: 413000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Observed
Two real defects were found through ad hoc manual testing (the "Meridian" 56-concept/40-task stress test run outside the persisted harness), fixed, and unit-tested — but never backported into docker/e2e/run-e2e.sh as a repeatable regression check, so nothing in the CI-required gate would catch either regressing:

- LCLI-261: `lore orphans` reported a Backlog subtask as orphaned even when its parent task was already linked to a doc (no parent/subtask hierarchy awareness). Fixed in orphans.ts; unit-tested (linked-parent/unlinked-subtask + fully-unlinked cases), but the harness's existing `orphans --tasks-only/--docs-only` phase has no parent/subtask fixture at all.
- LCLI-262: `lore supersede --rewrite-links` (and, via the shared rewrite engine, `lore rename`) silently retargeted a link whose display TEXT deliberately named the OLD concept (e.g. contrasting prose like "supersedes ADR-0005"), leaving the visible text and the link target mismatched with no warning. Fixed by adding a text-mismatch report in core/rewrite.ts; unit-tested, but the harness's existing `supersede --rewrite-links`/`rename --dry-run` phases only assert ordinary retargeting, never a link whose text names the old id.

## Why it matters
This project's own precedent (LCLI-56: "found 4 real defects that 1497 mocked tests had missed") is that the real-binary harness catches what mocks can't. Both of these bugs were literally discovered that way — through real, unscripted use — yet the fixes were only pinned by unit tests, not folded back into the repeatable gate that found the class of bug in the first place. Either regression could reappear silently.

## Direction (decide in plan)
Add: an orphans fixture with a linked parent task + unlinked subtask, asserting the subtask is NOT reported as orphaned (and a fully-unlinked task still is); and a supersede/rename fixture with an inbound link whose display text names the old id, asserting the retarget happens but a text-mismatch warning/report is also surfaced. Re-derive exact assertions from src/commands/orphans.ts and src/core/rewrite.ts at execution time rather than trusting this description.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Backlog subtask whose parent is linked to a doc is NOT reported as orphaned by lore orphans, asserted E2E; a fully-unlinked task still is (no false negative introduced)
- [ ] #2 lore supersede --rewrite-links retargeting a link whose display text names the old id both retargets AND surfaces a text-mismatch warning/report, asserted E2E
- [ ] #3 The same text-mismatch assertion is covered for lore rename (shared core/rewrite.ts engine)
- [ ] #4 The full harness runs green against the real pinned binary, and teardown is clean
<!-- AC:END -->
