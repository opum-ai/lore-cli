---
id: LCLI-222
title: >-
  Map spawn-rejections on all backlog calls (not just the probe's --version) to
  typed LoreErrors
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:29'
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
- [x] #1 Every spawn call in src/adapters/backlog.ts — the probe's step-3 `task list --json`, the `read` helper, `viewTask`, `createTask`, and `editTask`, not just the probe's `--version` — routes a spawn-level rejection through a typed LoreError: an ENOENT-coded rejection becomes `not_found`, and other coded spawn rejections become a typed LoreError rather than an untyped throw.
- [x] #2 A test injects a fake spawn that lets the probe pass (`--version` and `task list --json` succeed) and then rejects a later call (e.g. `viewTask`/`createTask`/`editTask`) with an ENOENT-coded error, asserting the surfaced error is a typed LoreError with type `not_found` — mirroring the existing probe-only test at test/backlog-adapter.test.ts:439-445.
- [x] #3 `bun test` passes, including test/backlog-adapter.test.ts and test/backlog-probe.test.ts.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a shared spawnOrThrow(spawn, args) wrapper in src/adapters/backlog.ts that catches a spawn-level rejection: ENOENT -> not_found (reusing the existing RUNBOOK_HINT message), EACCES/EPERM -> denied, any other coded errno -> validation (message embeds deriveMessage(cause) so the original OS diagnostic survives), and an uncoded rejection (e.g. the LoreError bunBacklogSpawn's own timeout already throws) propagates unchanged.
2. Route all 6 spawn call sites through it: probeBacklog step 1 (--version), probeBacklog step 3 (task list --json), the read() helper, viewTask, createTask, editTask.
3. Add a new test in test/backlog-adapter.test.ts: probe passes cleanly (--version + task list --json both succeed via defaultProbe), then a later, distinct task view spawn rejects ENOENT; assert the surfaced error is a typed not_found LoreError and that spawn.calls shows the probe's two calls completed before the rejecting call.
4. Verify: bun test (full suite) + bun run typecheck + bunx biome check on the two changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added a shared spawnOrThrow(spawn, args) wrapper in src/adapters/backlog.ts and routed all 6 direct spawn() call sites through it: probeBacklog step 1 (--version), probeBacklog step 3 (task list --json), the read() helper, viewTask, createTask, editTask. ENOENT -> not_found (same message/hint the probe's --version path already used); EACCES/EPERM -> denied; any other coded errno (EMFILE/EAGAIN/...) -> validation, embedding deriveMessage(cause) so the OS diagnostic is preserved; an uncoded rejection (e.g. bunBacklogSpawn's own LoreError timeout) propagates unchanged. Verified: bun test test/backlog-adapter.test.ts test/backlog-probe.test.ts -> 61 pass/0 fail (was 60, +1 new AC#2 test); full bun test -> 1960 pass/0 fail; bun run typecheck -> clean (tsc --noEmit, no output); bunx biome check on both changed files -> clean, no errors. Confirmed test/backlog-probe.test.ts's existing 'a non-ENOENT spawn rejection propagates unchanged' test (EACCES) still passes because the new denied LoreError's message embeds the original cause message ('kernel said no'), satisfying its substring assertion, while now also being a typed LoreError instead of an untyped throw.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the shared spawnOrThrow(spawn, args) wrapper and routed every direct backlog spawn call (probe --version, probe task-list --json, the read() helper, viewTask, createTask, editTask) through it, so any spawn-level rejection is now a typed LoreError: ENOENT -> not_found, EACCES/EPERM -> denied, other coded errno -> validation, uncoded rejections pass through unchanged. Added a test proving a later call (viewTask) still maps an ENOENT rejection to not_found after the probe itself already passed cleanly. Verified with bun test (1960 pass/0 fail, incl. both backlog-adapter.test.ts and backlog-probe.test.ts), bun run typecheck (clean), and bunx biome check on both changed files (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
