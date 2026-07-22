---
id: LORE-189
title: >-
  Fix stale src/commands/sync.ts module doc claiming link/unlink/rename do not
  self-commit
status: To Do
assignee: []
created_date: '2026-07-22 21:29'
labels:
  - codex-review-followup
  - cmd-crud-b
dependencies: []
priority: low
type: bug
ordinal: 199000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-10 integration finding (surfaced by LORE-146). The module doc comment at src/commands/sync.ts:30-31 reads that `link`/`unlink`/`rename` "do not yet call state.ts themselves (LORE-49 follow-up)" and that `sync` is what satisfies their commit contract "for now". This is false on all three counts today — link.ts (runLink ~:268, runUnlink ~:338) and rename.ts (~:225) all call commitBacklogFiles directly — and it now states the exact opposite of the `linking` instructions prose that LORE-146 just corrected in src/core/instructions.ts. Hazard: a future agent treating sync.ts’s header as ground truth could "re-correct" instructions.ts and regress LORE-146 (the LORE-146 instructions test would catch the regression, but the misleading comment is the root cause). Doc-comment-only fix; may be folded into the next task touching sync.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module doc comment at src/commands/sync.ts:30-31 no longer claims link/unlink/rename leave their backlog/tasks edits for `lore sync` to commit; it accurately states each of link/unlink/rename commits its own touched files via commitBacklogFiles.
- [ ] #2 The corrected sync.ts comment is consistent with the `linking` instructions prose in src/core/instructions.ts (as fixed by LORE-146) — no contradiction between the two.
<!-- AC:END -->
