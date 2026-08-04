---
id: LCLI-300
title: >-
  docker/e2e: two Meridian-stress-test regressions (LCLI-261 orphans hierarchy,
  LCLI-262 rewrite-links text mismatch) never backported into the persisted
  harness
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 04:10'
updated_date: '2026-08-04 07:25'
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
modified_files:
  - docker/e2e/run-e2e.sh
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In Phase 10, create a real parent task and child subtask with the pinned Backlog binary, link only the parent to the existing Story, then assert lore orphans omits the child while the existing never-linked TASK3 remains reported. 2. Before the Phase 15 rename, append an inbound link to the Reference whose display text names its old id; capture stderr from the real rename, assert the destination retargets to reference/e2e-renamed, and assert the warning names the stale text, source file, old id, and new id. 3. In Phase 16, add a second inbound ADR link whose display text names the old ADR id; capture the real supersede rewrite stdout and stderr, assert rewroteLinks is true, both inbound destinations retarget, and the warning reports the old-text/new-target mismatch. 4. Keep all probes inside the existing scratch bundle with no new repository files, then run shell parsing, diff hygiene, the complete rebuilt Docker E2E harness, proportionate repository gates, and adversarial self-review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restore research revalidated a clean dev at 630acbf556971f4a5d7ff30a10af80e2afa9346c, one worktree, no in-flight task, and both formal dependencies Done. Current source confirms parentTaskId hierarchy awareness in orphans.ts and a shared rewrite warning rendered by both rename and supersede as: link text OLD in docs/PATH still names FROM, but its link now points to TO. The existing harness already has suitable Story, Reference, Spec, ADR, and genuinely unlinked TASK3 fixtures, so the regression coverage can be added without expanding beyond docker/e2e/run-e2e.sh.

Implemented the planned real-binary probes in docker/e2e/run-e2e.sh. Phase 10 now creates a genuine parent/subtask pair, links only the parent to the otherwise-empty multi-doc Story, and value-asserts that the child is omitted while fully-unlinked TASK3 remains. Phase 15 captures rename stdout/stderr and asserts both the stale-text link retarget and the exact shared warning contract. Phase 16 does the same for supersede while retaining the ordinary-link control. bash -n and git diff --check pass. An unrelated untracked LCLI-302 task file appeared during implementation; it was not created or modified by this task and is being preserved.
<!-- SECTION:NOTES:END -->
