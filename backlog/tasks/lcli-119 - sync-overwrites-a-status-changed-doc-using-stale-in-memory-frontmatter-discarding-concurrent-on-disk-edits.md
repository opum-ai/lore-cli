---
id: LCLI-119
title: >-
  sync overwrites a status-changed doc using stale in-memory frontmatter,
  discarding concurrent on-disk edits
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - codex-review-followup
  - cmd-crud-b
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: medium
type: bug
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In runSync (src/commands/sync.ts:152-165), when a linked task's status changed during the reconciliation pass, the new file body is built via `serializeConcept({ ...concept, frontmatter: {...} }, { profile })` using the `concept` object captured in `targets`/`eligible` before the async Backlog round-trip (gatherReconciliation -> resolveAllTasks, see reconcile-shared.ts:158-177), not from the `original` bytes that are freshly re-read at line 155. Because `concept` is never re-read after that async gap, any edit made to the doc file on disk during the Backlog subprocess round-trip is silently discarded whenever `statusChanged` is also true — the freshly-read `original` is read but then thrown away in favor of the stale in-memory object for that branch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When a target's status changes during sync, the frontmatter/body used to build the new file content is derived from the freshly re-read `original` bytes (not the pre-round-trip in-memory `concept` object), so any other concurrent change already present in `original` survives the status update.
- [x] #2 A regression test simulates a concurrent on-disk edit to a linked doc occurring between the initial concept load and the status-changing write (e.g. by mutating the file on disk during/after gatherReconciliation but before the write loop) and asserts the edit is preserved in the final written bytes rather than being overwritten.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/commands/sync.ts's runSync write loop: when statusChanged, derive the serialized base from
   the FRESHLY re-read `original` bytes (parseConcept(original) -> override frontmatter.status ->
   serializeConcept), not from the stale pre-round-trip `concept` object. Add a small helper
   `withUpdatedStatus(path, raw, status, profile)` next to the loop.
2. Add a regression test in test/sync.test.ts that injects a BacklogAdapter whose viewTask mutates
   the doc file on disk (adds a body paragraph) on its first call -- simulating a concurrent edit
   landing during gatherReconciliation's async Backlog round-trip -- then asserts the final written
   bytes contain BOTH the updated status and the concurrently-added paragraph.
3. Mutation-check: temporarily revert the sync.ts hunk, confirm the new test fails, restore it.
4. Run bun test + bun run typecheck; verify AC#1/#2 with the new test plus a CLI repro if useful.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed: runSync's write loop now derives the status-changing base from a freshly re-parsed copy of the just-re-read `original` bytes (withUpdatedStatus: parseConcept(original) -> override frontmatter.status -> serializeConcept), instead of serializing the stale pre-round-trip `concept` object. Added a regression test (sync.test.ts, LCLI-119 describe block) with a BacklogAdapter whose viewTask mutates the doc on disk (adds a body paragraph) on its first call, simulating a concurrent edit landing during gatherReconciliation's async Backlog round-trip; asserts both the status update and the concurrent edit survive. Mutation-checked: reverted the sync.ts hunk via git stash, confirmed the new test fails (concurrent paragraph missing from written bytes), restored the fix, test passes again.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/commands/sync.ts: the statusChanged branch now re-parses the freshly re-read on-disk 'original' bytes (not the stale in-memory concept snapshot) before applying the reconciled status, so a concurrent on-disk edit made during gatherReconciliation's async Backlog round-trip survives. Verified: full suite 1749/1749 pass (0 fail), tsc --noEmit clean, biome lint clean on touched files; new regression test (test/sync.test.ts) fails on the pre-fix code (mutation-checked via git stash) and passes again after the fix is restored. A real end-to-end CLI repro against the on-PATH backlog binary was attempted but is blocked by this repo's pre-existing, unrelated gate: lore's BacklogAdapter requires a --json-capable Backlog.md fork not yet released (see the LCLI-1..4/Backlog.md-release-gated history) -- the on-PATH backlog v1.48.0 lacks --json support, so the fake-adapter regression test is the objective proof here, consistent with how sync.test.ts's own real-git-integration suite still injects a fake BacklogAdapter.
<!-- SECTION:FINAL_SUMMARY:END -->
