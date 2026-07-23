---
id: LORE-198
title: >-
  Update test/fixtures/README.md backlog-json section to match the upstream
  recorder
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
The `## backlog-json/` section of `test/fixtures/README.md` (live lines 21-37) still describes the world before the upstream migration: it names the retired jeremy-newhouse/Backlog.md fork, the old `LORE_BACKLOG_FORK_CLI` env var, the fork envelope-kind names `task`/`taskList`/`searchResult`, and a `filePath`→`{REPO}` redaction step. All four are contradicted by the live recorder `test/support/record-backlog-goldens.ts`, which since LORE-54 (migration to MrLesk/Backlog.md upstream, `--json` PR #790, pinned commit) and LORE-106 (recorder guards) uses the `LORE_BACKLOG_UPSTREAM_CLI` env var, emits the hyphenated kinds `task-view`/`task-list`/`search`, and does NO redaction (upstream's `path` is already project-relative). The README should be brought back into agreement with the recorder so a maintainer regenerating goldens is not misled. Provenance: doc-2 Codex second-opinion review, low-severity finding [1] of the build-runtime cluster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The `## backlog-json/` section of test/fixtures/README.md names MrLesk/Backlog.md upstream (PR #790 / the pinned commit) as the golden source, not the jeremy-newhouse fork.
- [ ] #2 The regeneration command in that section uses the env var `LORE_BACKLOG_UPSTREAM_CLI`, matching test/support/record-backlog-goldens.ts (not `LORE_BACKLOG_FORK_CLI`).
- [ ] #3 The documented envelope kinds are the hyphenated `task-view`, `task-list`, `search` (not `task`/`taskList`/`searchResult`).
- [ ] #4 The sentence claiming the recorder redacts an absolute `filePath` to `{REPO}` is removed or corrected to state that no redaction is needed because upstream's `path` is already project-relative.
- [ ] #5 `bun test` still passes after the edit (confirming no test asserts on the README text; the change is documentation-only).
<!-- AC:END -->
