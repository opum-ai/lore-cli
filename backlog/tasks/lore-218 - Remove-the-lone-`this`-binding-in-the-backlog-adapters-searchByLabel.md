---
id: LORE-218
title: Remove the lone `this` binding in the backlog adapter's searchByLabel
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - adapter-backlog
  - codex-review-followup
dependencies: []
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
- [ ] #1 `searchByLabel` no longer references `this`; it invokes the shared `listTasks` implementation directly (e.g. a closed-over local function), matching how the rest of the adapter closes over `read`/`ensureProbed`. A grep for `this.` in src/adapters/backlog.ts returns no matches inside createBacklogAdapter.
- [ ] #2 A test destructures the method off the adapter (`const { searchByLabel } = createBacklogAdapter(spawn)`) and calls it standalone, asserting it still delegates to the exact `--labels` AND-match — proving the `this`-fragility is gone.
- [ ] #3 The existing searchByLabel tests (test/backlog-adapter.test.ts:126 and :465) stay green and `bun test` passes.
<!-- AC:END -->
