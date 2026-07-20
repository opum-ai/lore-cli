---
id: LORE-65
title: >-
  docker/e2e coupling mediums: field-isolated write read-backs, multi-doc SET
  semantics, backlog-side renames/archive, ADR-0012 commit scoping, nested
  checkout
status: In Progress
assignee:
  - '@jeremy-newhouse'
created_date: '2026-07-19 22:59'
updated_date: '2026-07-20 15:19'
labels:
  - e2e
  - testing
  - backlog-fork
  - adapter
dependencies:
  - LORE-56
references:
  - docker/e2e/run-e2e.sh
  - src/adapters/backlog.ts
  - src/core/state.ts
priority: medium
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A multi-agent coverage audit of docker/e2e (2026-07-19, dev @ b8a4667; adversarially verified) confirmed four medium-tier gaps in the real-binary Backlog coupling — each dependent on real git or real backlog semantics that unit fakes cannot exercise:

**1. Writes never read back at field granularity; multi-doc SET/REPLACE never runs.** link/unlink assertions cannot isolate the label from the doc ref ("removed" fires on hadLabel OR hadDoc; a residual doc entry after unlink means re-link's "added" is satisfiable by the label alone) — a partial-write bug (mangled --add-label comma-join while --doc lands, or vice versa; src/adapters/backlog.ts:784-794) passes every current assertion. The multi-concept --doc case (a task linked from two docs: link must preserve the other doc's ref, unlink must remove only its own) never runs. LORE-57 was precisely a write-side flag mismatch against the real binary.

**2. Backlog-side file moves.** (a) The pinned binary's --title edit renames the task FILE — never flowed end-to-end through sync's sweep commit; (b) the renamed path never verified to flow into the managed-block link href; (c) an archived linked task (backlog task archive) — whether it reads as missing via the exit-1-null signature and what sync/check exit with is an undetermined real semantic: run exploratory once, then pin the observed behavior. Title edits and archiving are everyday operations. (porcelainPaths rename-branch parsing itself is already unit-pinned against real git in test/state.test.ts — the gap is the end-to-end residue.)

**3. ADR-0012 commit scoping never inspected.** No step inspects a lore-authored commit's file list (backlog/ only), no step pre-stages a non-backlog change and asserts it survives unswept, and no task title with ()[]* metacharacters ever exercises the :(literal) pathspec quoting (src/core/state.ts:89-91) through real git. A scoping regression silently commits a developer's in-flight work under lore's authorship — data-loss-adjacent.

**4. Nested checkout dead code path.** porcelainPaths' --show-prefix translation (state.ts:257-262) is dead in every run — the harness always git-inits /workspace itself, so the prefix is always empty. A regression breaks every per-write and sweep commit for any project nested in a monorepo (the code comment documents the exact double-prefix failure mode). Needs a small fixture: a git root ABOVE the lore project dir.

The audit produced concrete proposed steps for each — re-derive against the current script at execution time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Write read-backs are field-isolated against the real task record (label and doc ref asserted separately), and the multi-doc SET/REPLACE case (one task linked from two docs) pins preserve-the-other-doc semantics on both link and unlink
- [ ] #2 A backlog-side --title edit file rename is swept by sync and the managed-block href follows the renamed file; the archived-linked-task behavior is pinned (exploratory run first, then a fixed expectation)
- [ ] #3 A lore-authored commit file list is inspected (backlog/ paths only), a pre-staged unrelated file survives unswept, and a metachar-titled task exercises the :(literal) pathspec path through real git
- [ ] #4 A nested checkout (git root above the lore project) exercises the --show-prefix translation: link back-ref commits succeed and scope correctly
- [ ] #5 The full harness runs green against the real pinned upstream binary, and teardown is clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Re-derived every technique against current source before writing fixtures (src/state.ts, not src/core/state.ts -- the task's own citation was stale on the path but accurate on line numbers; src/adapters/backlog.ts editTask at 781-795).

Two of the filing task's own assumptions are WRONG (verified against the pinned fork's source at /Users/jdnewhouse/repos/Backlog.md, a checkout very close to the Dockerfile's pinned commit, plus a local empirical probe):
1. AC2's premise ("--title edit renames the task FILE") is false: file-system/operations.ts saveTask's shouldPreservePath branch reuses the existing task.filePath whenever one is set (always true on edit), so the filename stays anchored to id+ORIGINAL title. The REAL backlog-side file-move operation is `task archive` (archiveTask does a real rename() to backlog/archive/tasks/), which getTaskPath never scans -- so an archived linked task should mirror LORE-62's already-pinned vanished-task signature. AC2 will test archive instead of a title-edit rename, plus a real (harmless) title-edit-doesn't-rename finding.
2. AC3's proposed "metachar-titled task" technique is also false: Backlog's own sanitizeFilename strips ()[] entirely and turns * into a hyphen, so no title the CLI accepts can ever put a glob metachar into a backlog/ filename. Test the :(literal) pathspec guard instead via a direct on-disk rename (bypassing the CLI), which is exactly the scenario state.ts's own doc comment says the guard protects against.

Plan (docker/e2e/run-e2e.sh, new phases only, no src/ changes expected):
- Phase 4b (AC1): after existing Phase 4 link/unlink, add field-isolated real-record read-backs (`.task.labels` / `.task.documentation` checked SEPARATELY via `backlog task view --json`, not lore's self-reported backRef status) for TASK1; then a multi-doc SET/REPLACE case using a freshly-created, minimally-coupled second Story (TASK1 linked to both), pinning preserve-the-other-doc semantics on both unlink and re-link; restore TASK1 to Phase 4's original single-Story baseline at the end.
- Phase 4c (AC2): backlog-side file moves. Document the title-edit non-rename finding (still assert the new title flows into the managed block's Title column). Then archive TASK2 (linked), pin the exit-1/empty-stdout raw view signature, `lore sync` not_found/exit-3/empty-stdout, `lore check` exits 3 but still emits check.report first, `lore tasks` soft-drops it -- mirroring LORE-62's Phase 5b vanished-task assertions exactly. Restore by moving the file back (archiveTask is a pure rename, content byte-identical, so no re-link needed).
- Phase 4d (AC3): ADR-0012 commit scoping. Inspect the most recent lore-authored commit's file list (git diff-tree) and assert every path starts with backlog/. Pre-stage an unrelated dirty file at repo root, run a scoped `lore link`, assert it survives unswept. Directly rename an untracked task file on disk to include glob metachars ([, ], *), run `lore sync`'s catch-all sweep, assert the exact metachar filename was committed (proving the :(literal) pathspec, not shell/git glob expansion).
- Phase 24b (AC4): nested checkout. Build a wholly separate /tmp fixture: an outer git repo with a nested-project/ subdirectory holding its own backlog+lore project (lore's root is always cwd, never git-toplevel-walked -- confirmed via src/cli.ts). Confirm `git rev-parse --show-prefix` is non-empty from inside it, then `lore link` there and assert the resulting commit lands correctly scoped in the OUTER repo's history and leaves git status clean under the nested backlog/ (proving porcelainPaths' prefix-stripping works under a real non-empty prefix).
- AC5: iterate against the real docker/e2e harness (build+up, always down -v) until green; bun test unaffected (no src/ changes expected).
- Independent adversarial review of the diff before opening the PR (established campaign practice).
<!-- SECTION:PLAN:END -->
