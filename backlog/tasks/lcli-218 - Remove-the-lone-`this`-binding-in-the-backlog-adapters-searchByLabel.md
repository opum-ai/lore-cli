---
id: LCLI-218
title: Remove the lone `this` binding in the backlog adapter's searchByLabel
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - adapter-backlog
  - codex-review-followup
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: enhancement
ordinal: 320000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `searchByLabel` should work regardless of how it is called (including destructured off the adapter), consistent with every other method in the adapter.

**Why:** `createBacklogAdapter` returns an object whose methods all close over the standalone `read`/`ensureProbed` helpers and never rely on `this` — except `searchByLabel`, which calls `this.listTasks(...)`. That is a latent fragility and an inconsistency: destructuring the method (`const { searchByLabel } = adapter; searchByLabel(x)`) throws because `this` is undefined. It is currently harmless only because the sole callers use `adapter.searchByLabel(...)`, but the code should not depend on that.

**Live context:** src/adapters/backlog.ts:746-748 — `async searchByLabel(label) { return this.listTasks({ labels: [label] }); }`. The `listTasks` implementation is the returned method at :712-722. The clean shape is to give `listTasks` a closed-over local implementation (like `read`/`ensureProbed`) that both the returned `listTasks` method and `searchByLabel` invoke directly, so no `this` remains.

**Provenance:** doc-2 (Codex second-opinion review) low-severity finding, adapter-backlog cluster, round-3 re-audit — confirmed still present on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `searchByLabel` no longer references `this`; it invokes the shared `listTasks` implementation directly (e.g. a closed-over local function), matching how the rest of the adapter closes over `read`/`ensureProbed`. A grep for `this.` in src/adapters/backlog.ts returns no matches inside createBacklogAdapter.
- [x] #2 A test destructures the method off the adapter (`const { searchByLabel } = createBacklogAdapter(spawn)`) and calls it standalone, asserting it still delegates to the exact `--labels` AND-match — proving the `this`-fragility is gone.
- [x] #3 The existing searchByLabel tests (test/backlog-adapter.test.ts:126 and :465) stay green and `bun test` passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract a closed-over local async function listTasks(opts) inside createBacklogAdapter (alongside read/ensureProbed), moving the existing implementation body verbatim.
2. Change the returned object's listTasks property to reference the closed-over function directly (listTasks,), and change searchByLabel to call listTasks(...) instead of this.listTasks(...).
3. Add a new test in test/backlog-adapter.test.ts that does const { searchByLabel } = createBacklogAdapter(spawn) and calls it standalone, asserting the same --labels AND-match argv and result shape as the existing adapter.searchByLabel test.
4. Verify: grep for 'this.' in src/adapters/backlog.ts has no code matches inside createBacklogAdapter; bun test full suite 0 failures; bun run typecheck clean; bunx biome check on the two changed files clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extracted a closed-over local async function listTasks(opts) inside createBacklogAdapter (same pattern as read/ensureProbed); the returned object now exposes it via 'listTasks,' and searchByLabel calls listTasks(...) directly, no this. remaining. Verification: grep -n 'this\.' src/adapters/backlog.ts shows only an unrelated doc-comment sentence, zero matches inside createBacklogAdapter (AC#1). Added a test destructuring const { searchByLabel } = createBacklogAdapter(spawn) and calling it standalone, asserting the same ['task','list','--json','--labels','doc:stories/x'] argv and 3-item result as the adapter-bound call (AC#2). Full bun test: 1937 pass / 0 fail across 47 files, including the pre-existing :126 adapter-bound searchByLabel test and the :465 dash-prefixed-label rejection test both still green (AC#3). bun run typecheck clean. bunx biome check on both changed files: no issues.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the sole this-binding in the backlog adapter: listTasks is now a closed-over local async function inside createBacklogAdapter (alongside read/ensureProbed), and both the returned listTasks method and searchByLabel invoke it directly. searchByLabel's --labels AND-match delegation is unchanged. Added a test proving searchByLabel works when destructured off the adapter and called standalone. Verified: bun test 1937 pass/0 fail (incl. backlog-adapter.test.ts 41/41, the :126 and :465 pre-existing searchByLabel cases green); bun run typecheck clean; grep for this. in src/adapters/backlog.ts has no code matches inside createBacklogAdapter; bunx biome check clean on both changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
