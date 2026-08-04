---
id: LCLI-189
title: >-
  Fix stale src/commands/sync.ts module doc claiming link/unlink/rename do not
  self-commit
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - cmd-crud-b
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: bug
ordinal: 199000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-10 integration finding (surfaced by LCLI-146). The module doc comment at src/commands/sync.ts:30-31 reads that `link`/`unlink`/`rename` "do not yet call state.ts themselves (LCLI-49 follow-up)" and that `sync` is what satisfies their commit contract "for now". This is false on all three counts today — link.ts (runLink ~:268, runUnlink ~:338) and rename.ts (~:225) all call commitBacklogFiles directly — and it now states the exact opposite of the `linking` instructions prose that LCLI-146 just corrected in src/core/instructions.ts. Hazard: a future agent treating sync.ts’s header as ground truth could "re-correct" instructions.ts and regress LCLI-146 (the LCLI-146 instructions test would catch the regression, but the misleading comment is the root cause). Doc-comment-only fix; may be folded into the next task touching sync.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The module doc comment at src/commands/sync.ts:30-31 no longer claims link/unlink/rename leave their backlog/tasks edits for `lore sync` to commit; it accurately states each of link/unlink/rename commits its own touched files via commitBacklogFiles.
- [x] #2 The corrected sync.ts comment is consistent with the `linking` instructions prose in src/core/instructions.ts (as fixed by LCLI-146) — no contradiction between the two.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read src/commands/sync.ts:1-46 module doc and confirm link.ts/rename.ts each call commitBacklogFiles directly (link.ts:268,338; rename.ts:225). 2. Read src/core/instructions.ts linking topic to confirm the corrected sync.ts comment must match: link/unlink/rename self-commit via commitBacklogFiles; sync's commit step is a catch-all sweep for anything else left dirty. 3. Reword sync.ts:25-32 module doc to state link/unlink/rename already commit their own touched files (LCLI-49), removing the false 'do not yet call state.ts themselves' claim, and describe sync's commitBacklogIfDirty call as a catch-all sweep -- consistent with instructions.ts. 4. Verify: bun test (full suite) + bun run typecheck must be clean; doc-comment-only change, no test/code edits expected.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reworded src/commands/sync.ts:25-32 module doc comment: removed the false claim that link/unlink/rename 'do not yet call state.ts themselves (LCLI-49 follow-up)' and that sync satisfies AC#2 'for now'. Confirmed on real code that link.ts (runLink ~L268, runUnlink ~L338) and rename.ts (~L225) already call commitBacklogFiles directly right after writing their touched backlog/tasks files. New wording states link/unlink/rename already commit their own touched files via commitBacklogFiles (LCLI-49), and sync's commitBacklogIfDirty call is a catch-all sweep for anything else left dirty under backlog/ (a human's direct backlog task edit, or a prior run's failed commit). Cross-checked against src/core/instructions.ts's 'linking' topic (as corrected by LCLI-146, lines ~46-54): identical framing -- link/unlink self-commit via commitBacklogFiles, sync's commit step is a catch-all sweep -- no contradiction. instructions.ts was read only, not edited (out of scope for this task). Verification: bun test -> 1900 pass, 0 fail, 5353 expect() calls (full suite, includes the existing LCLI-146 instructions test, unaffected since this is a doc-comment-only change). bun run typecheck (tsc --noEmit) -> clean, no errors. bun run lint on the changed file (sync.ts) -> no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reworded the module doc comment at src/commands/sync.ts:25-32, which falsely claimed link/unlink/rename 'do not yet call state.ts themselves (LCLI-49 follow-up)' and that sync satisfies their commit contract 'for now'. That was already false: link.ts and rename.ts each call commitBacklogFiles directly right after writing their touched backlog/tasks files. The comment now states link/unlink/rename already self-commit via commitBacklogFiles (LCLI-49), and that sync's commitBacklogIfDirty call is a catch-all sweep for anything else left dirty under backlog/. Confirmed consistent with the corrected 'linking' instructions prose in src/core/instructions.ts (read-only, not edited -- out of scope). Doc-comment-only change, contained to src/commands/sync.ts. Verified with bun test (1900 pass, 0 fail) and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
