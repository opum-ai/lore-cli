---
id: LORE-49
title: retrofit link/unlink/rename to commit backlog/ via state.ts
status: To Do
assignee: []
created_date: '2026-07-06 22:10'
labels:
  - cmd
dependencies:
  - LORE-26
priority: medium
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore-design.md §3.6 shows commands/link.ts and commands/rename.ts calling state.ts
to git add/commit backlog/ immediately after each Backlog write (task create/edit),
matching ADR-0012's "lore is the sole committer of backlog/" decision. LORE-24
(link/unlink/rename, merged via PR #35) predates state.ts and does not do this —
its Backlog writes (labels, --doc) currently sit uncommitted in the working tree
until something else commits them.

LORE-26 (lore sync) introduces state.ts and satisfies its own AC#2 by having
`lore sync` vacuum up and commit any uncommitted backlog/ changes when it runs,
regardless of source — by explicit user choice, deferring a retrofit of
link/unlink/rename to this follow-up task rather than expanding LORE-26's scope
onto already-shipped, merged code.

This task: change commands/link.ts (runLink/runUnlink) and commands/rename.ts's
moveBackRefs call site to invoke state.ts's commitBacklogIfDirty (or an equivalent
per-write commit) immediately after each Backlog write, per the design doc's
literal sequence flow — so backlog/ is never left uncommitted between a link/unlink/
rename call and the next `lore sync`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 link/unlink commit their own backlog/ writes immediately, matching design §3.6
- [ ] #2 rename's back-ref move commits its backlog/ writes immediately
- [ ] #3 no regression to LORE-24's existing exit codes/behavior
<!-- AC:END -->
