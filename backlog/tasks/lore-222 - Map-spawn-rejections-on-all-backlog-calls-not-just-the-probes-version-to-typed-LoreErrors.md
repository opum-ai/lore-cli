---
id: LORE-222
title: >-
  Map spawn-rejections on all backlog calls (not just the probe's --version) to
  typed LoreErrors
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - adapter-backlog
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 324000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** A spawn-level failure on any `backlog` invocation should surface as a typed LoreError with the right exit code, not a raw untyped throw.

**Why:** lore's contract is fail-loud with typed LoreErrors and stable exit codes. Today only the probe's very first spawn (`--version`) catches a spawn rejection and maps ENOENT to `not_found`. Every later spawn — including the probe's own step-3 dry read — lets a spawn-level rejection escape untyped, so a binary that disappears mid-run, or a resource-limit/permission spawn failure (EMFILE/EACCES/EAGAIN), produces a generic uncaught error and the wrong exit code instead of the intended `not_found`/`denied`/typed drift.

**Live context:** Wrapped spawn: src/adapters/backlog.ts:158-165 (probe `--version`). Bare, unwrapped spawns: :188 (probe step-3 `task list --json`), :700-707 (`read` helper), :726 (`viewTask`), :791 (`createTask`), :831 (`editTask`). The natural seam is a shared spawn wrapper reused by all call sites (the adapter already funnels reads through the `read` helper and has `ensureProbed`).

**Provenance:** doc-2 (Codex second-opinion review) low-severity finding, adapter-backlog cluster, round-3 re-audit — confirmed still present on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every spawn call in src/adapters/backlog.ts — the probe's step-3 `task list --json`, the `read` helper, `viewTask`, `createTask`, and `editTask`, not just the probe's `--version` — routes a spawn-level rejection through a typed LoreError: an ENOENT-coded rejection becomes `not_found`, and other coded spawn rejections become a typed LoreError rather than an untyped throw.
- [ ] #2 A test injects a fake spawn that lets the probe pass (`--version` and `task list --json` succeed) and then rejects a later call (e.g. `viewTask`/`createTask`/`editTask`) with an ENOENT-coded error, asserting the surfaced error is a typed LoreError with type `not_found` — mirroring the existing probe-only test at test/backlog-adapter.test.ts:439-445.
- [ ] #3 `bun test` passes, including test/backlog-adapter.test.ts and test/backlog-probe.test.ts.
<!-- AC:END -->
