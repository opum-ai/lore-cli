---
id: LORE-183
title: >-
  Guard moveBackRefs viewTask consumer + de-duplicate the id-mismatch check
  across link.ts/tasks.ts/reconcile-shared.ts
status: To Do
assignee: []
created_date: '2026-07-22 19:02'
labels:
  - codex-review-followup
  - cmd-link
dependencies: []
priority: medium
type: bug
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-7 integration-review follow-up (findings 1+2). LORE-122 (resolveTaskDetails in src/commands/reconcile-shared.ts), LORE-177 (verifiedViewTask in src/commands/link.ts), and LORE-125 (inline in resolveRollup, src/commands/tasks.ts) now hold three byte-identical copies of the same viewTask id-mismatch guard (same comparison, same LoreError('not_found',...) type, byte-identical message + hint + {taskId, resolvedId} input). Two gaps:

1. GENUINE UNGUARDED 4TH CONSUMER (the medium reason): moveBackRefs (src/commands/link.ts:~432, called by src/commands/rename.ts) is a raw, unguarded adapter.viewTask consumer. It uses the returned detail's labels + documentation (link.ts:~444-461) to compute an editTask WRITE under the requested taskId — exactly the 'borrow another task's data while writing under the requested id' hazard class LORE-177 guarded removeBackRefs against. A mismatched/ambiguous adapter detail here corrupts a task's documentation list during 'lore rename'. verifiedViewTask already returns null → 'already-current' compatibly, and moveBackRefs runs under runSequentially (link.ts:~835-848) which catches per-task throws into a 'failed' outcome, so wiring the guard in degrades gracefully.

2. TRIPLICATION: the check/message/hint exist in 3 hand-maintained places and will silently drift on the first single-site edit. tasks.ts already imports dedupeTaskIds/defaultAdapter from link.ts, so a shared helper (export verifiedViewTask, or hoist a taskIdMismatchError(taskId, resolvedId) factory next to resolveTaskDetails) is trivially reachable.

3. The verifiedViewTask doc comment (src/commands/link.ts:~501-503) is now factually false: it claims 'every one of this module's viewTask consumers' and enumerates 3, but the module has 4 (moveBackRefs is the 4th).

Found by the wave-7 integration review (2026-07-22); see doc-3 wave log. Not a regression from wave 7 — moveBackRefs was outside LORE-177's cited scope (link.ts:180/212/346).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 moveBackRefs (link.ts) routes its adapter.viewTask result through the same id-mismatch guard as verifiedViewTask (case-insensitive id match; a mismatched detail is refused rather than used to compute the editTask write), and 'lore rename' surfaces the mismatch as a per-task failure instead of corrupting the doc list
- [ ] #2 The id-mismatch check (comparison + LoreError type + message + hint + {taskId,resolvedId} input) exists in ONE shared place, consumed by link.ts's viewTask consumers and by resolveRollup in tasks.ts; the inline duplicate in tasks.ts is replaced by the shared helper with no behavior change (existing LORE-125 tasks.test.ts assertions still pass)
- [ ] #3 The verifiedViewTask (or shared helper) doc comment accurately describes which consumers it covers (no longer claims 'every viewTask consumer' while omitting moveBackRefs)
- [ ] #4 A regression test drives the rename/moveBackRefs path with a stubbed adapter returning a mismatched id and asserts the operation refuses rather than writing the wrong task's documentation into the back-ref; full suite + typecheck + biome remain green
<!-- AC:END -->
