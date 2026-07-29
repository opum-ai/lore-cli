---
id: LCLI-198
title: >-
  Update test/fixtures/README.md backlog-json section to match the upstream
  recorder
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:28'
labels:
  - build-runtime
  - codex-review-followup
  - docs
dependencies: []
priority: low
type: docs
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `## backlog-json/` section of `test/fixtures/README.md` (live lines 21-37) still describes the world before the upstream migration: it names the retired jeremy-newhouse/Backlog.md fork, the old `LORE_BACKLOG_FORK_CLI` env var, the fork envelope-kind names `task`/`taskList`/`searchResult`, and a `filePath`→`{REPO}` redaction step. All four are contradicted by the live recorder `test/support/record-backlog-goldens.ts`, which since LCLI-54 (migration to MrLesk/Backlog.md upstream, `--json` PR #790, pinned commit) and LCLI-106 (recorder guards) uses the `LORE_BACKLOG_UPSTREAM_CLI` env var, emits the hyphenated kinds `task-view`/`task-list`/`search`, and does NO redaction (upstream's `path` is already project-relative). The README should be brought back into agreement with the recorder so a maintainer regenerating goldens is not misled. Provenance: doc-2 Codex second-opinion review, low-severity finding [1] of the build-runtime cluster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The `## backlog-json/` section of test/fixtures/README.md names MrLesk/Backlog.md upstream (PR #790 / the pinned commit) as the golden source, not the jeremy-newhouse fork.
- [x] #2 The regeneration command in that section uses the env var `LORE_BACKLOG_UPSTREAM_CLI`, matching test/support/record-backlog-goldens.ts (not `LORE_BACKLOG_FORK_CLI`).
- [x] #3 The documented envelope kinds are the hyphenated `task-view`, `task-list`, `search` (not `task`/`taskList`/`searchResult`).
- [x] #4 The sentence claiming the recorder redacts an absolute `filePath` to `{REPO}` is removed or corrected to state that no redaction is needed because upstream's `path` is already project-relative.
- [x] #5 `bun test` still passes after the edit (confirming no test asserts on the README text; the change is documentation-only).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Read test/support/record-backlog-goldens.ts to confirm live env var (LORE_BACKLOG_UPSTREAM_CLI), hyphenated kinds (task-view/task-list/search), and no-redaction fact. Rewrite the backlog-json/ section of test/fixtures/README.md (lines 21-37) to: (1) name MrLesk/Backlog.md upstream PR #790 / pinned commit as golden source instead of the jeremy-newhouse fork; (2) use LORE_BACKLOG_UPSTREAM_CLI in the regen command; (3) list hyphenated kinds task-view/task-list/search; (4) replace the redaction sentence with a correct statement that no redaction is needed since path is already project-relative. Verify with bun test (full suite, expect 0 failures) and bun run typecheck (clean). Doc-only change, no code touched.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read test/support/record-backlog-goldens.ts (lines 3-11, 58-77) to confirm live env var LORE_BACKLOG_UPSTREAM_CLI, hyphenated GOLDEN_FILES kinds task-view/task-list/search, and the doc comment stating no redaction is needed since upstream's path is project-relative. Rewrote test/fixtures/README.md lines 21-37 accordingly: MrLesk/Backlog.md upstream PR #790 / Dockerfile-pinned commit as golden source (AC#1); LORE_BACKLOG_UPSTREAM_CLI in the regen command (AC#2); hyphenated kinds task-view/task-list/search (AC#3); redaction sentence replaced with a correct no-redaction statement (AC#4). Verified: full 'bun test' -> 1913 pass, 0 fail (AC#5); 'bun run typecheck' -> clean (tsc --noEmit, no errors); grep for 'test/fixtures/README' across test/ and src/ found zero references, confirming no test asserts on the README text. git status --short shows only test/fixtures/README.md and this task file changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote the backlog-json/ section of test/fixtures/README.md (lines 21-37) to match the live recorder test/support/record-backlog-goldens.ts: names MrLesk/Backlog.md upstream (PR #790 / Dockerfile-pinned commit) as the golden source instead of the retired jeremy-newhouse fork; regen command uses LORE_BACKLOG_UPSTREAM_CLI instead of LORE_BACKLOG_FORK_CLI; documents the hyphenated envelope kinds task-view/task-list/search instead of task/taskList/searchResult; replaces the false filePath-redaction claim with a correct statement that upstream's path is already project-relative so no redaction is needed. Verified with full 'bun test' (1913 pass, 0 fail) and 'bun run typecheck' (clean); confirmed no test references test/fixtures/README.md text (doc-only change).
<!-- SECTION:FINAL_SUMMARY:END -->
