---
id: LORE-146
title: 'Fix `linking` instructions: link/unlink now commit backlog/tasks themselves'
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-engine-b
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
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
- [ ] #1 The `linking` instructions body in src/core/instructions.ts no longer states that `lore link`/`lore unlink` leave `backlog/tasks/*.md` uncommitted for `lore sync`
- [ ] #2 The updated text accurately describes that `lore link`/`lore unlink` commit the files they edit themselves (via `commitBacklogFiles`, scoped to the touched files), and clarifies what (if anything) is left for `lore sync` to commit
- [ ] #3 test/instructions.test.ts (or equivalent) is updated/added to assert the `linking` topic body no longer contains the outdated 'do not commit' claim
<!-- AC:END -->
