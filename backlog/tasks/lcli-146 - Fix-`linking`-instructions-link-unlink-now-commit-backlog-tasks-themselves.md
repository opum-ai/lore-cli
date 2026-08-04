---
id: LCLI-146
title: 'Fix `linking` instructions: link/unlink now commit backlog/tasks themselves'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - core-engine-b
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
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `linking` instructions topic (src/core/instructions.ts:46-49) tells agents that `lore link`/`lore unlink` edit `backlog/tasks/*.md` but leave it uncommitted for `lore sync` to pick up, and warns them to let `lore sync` commit those files. This is stale: src/commands/link.ts now calls `commitBacklogFiles(editedFiles, options, ...)` directly inside both `runLink` (line 247) and `runUnlink` (line 317), scoped to exactly the files each command touched, so link/unlink already commit their own edits. An agent following the current instructions text would wait on `lore sync` for a commit that already happened, or misunderstand the actual commit ownership.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The `linking` instructions body in src/core/instructions.ts no longer states that `lore link`/`lore unlink` leave `backlog/tasks/*.md` uncommitted for `lore sync`
- [x] #2 The updated text accurately describes that `lore link`/`lore unlink` commit the files they edit themselves (via `commitBacklogFiles`, scoped to the touched files), and clarifies what (if anything) is left for `lore sync` to commit
- [x] #3 test/instructions.test.ts (or equivalent) is updated/added to assert the `linking` topic body no longer contains the outdated 'do not commit' claim
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite src/core/instructions.ts LINKING topic body (lines ~46-49): replace stale 'edit but do not commit; only lore sync commits it' claim with accurate prose: link/unlink call commitBacklogFiles themselves right after writing, scoped to touched files; lore sync's own commit step is now a catch-all sweep for anything else left dirty under backlog/ (a human's direct edit, or a failed prior commit). Keep the 'never hand-edit backlog/tasks yourself' guidance. 2. Add a test in test/instructions.test.ts asserting the old 'do not commit it' / 'let lore sync commit them' phrasing is gone and the new commitBacklogFiles/catch-all-sweep phrasing is present. 3. Verify with bun test + bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote LINKING topic body in src/core/instructions.ts: removed the stale 'edit backlog/tasks/*.md directly but do not commit it -- only lore sync commits backlog/' claim; new prose states lore link/unlink commit their own touched files via commitBacklogFiles (scoped to editedFiles) immediately, and that lore sync's commit step is now a catch-all sweep for anything else left dirty under backlog/ (a human's direct backlog task edit, or a prior run's failed commit). Verified src/commands/link.ts (commitBacklogFiles calls at runLink line ~268, runUnlink line ~338) and src/commands/sync.ts's commitBacklogIfDirty catch-all doc comment before writing. Added a new test in test/instructions.test.ts (describe 'core/instructions — topic registry') asserting the old phrasing is gone and the new commitBacklogFiles/catch-all-sweep phrasing is present, using whitespace-normalized body matching. Verification: bun test test/instructions.test.ts -> 14 pass/0 fail/51 expect() calls; bun run typecheck -> clean; full bun test -> 1810 pass/0 fail across 47 files; manually inspected bun run src/cli.ts instructions linking --plain output.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed stale linking instructions prose in src/core/instructions.ts: link/unlink no longer described as leaving backlog/tasks/*.md uncommitted for lore sync. New text accurately reflects that both commands call commitBacklogFiles themselves (scoped to the files they touched) immediately after writing, and that lore sync's commit step is now just a catch-all sweep for anything else left dirty under backlog/. Added a regression test in test/instructions.test.ts asserting the removed claim's phrasing is gone and the new phrasing is present. Verified: bun test test/instructions.test.ts (14 pass/0 fail), full bun test (1810 pass/0 fail, 47 files), bun run typecheck (clean), and manual bun run src/cli.ts instructions linking --plain output review.
<!-- SECTION:FINAL_SUMMARY:END -->
