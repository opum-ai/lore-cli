---
id: LORE-177
title: >-
  lore link viewTask consumers do not verify returned id matches requested id
  (sibling of LORE-122/125)
status: To Do
assignee: []
created_date: '2026-07-22 14:29'
labels:
  - codex-review-followup
  - cmd-link
dependencies: []
priority: medium
type: bug
ordinal: 129500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LORE-122 hardened resolveTaskDetails (`src/commands/reconcile-shared.ts`) to reject an adapter.viewTask result whose returned id does not match the requested id. The wave-3 integration review found the same latent bug remains in the other viewTask consumers, which still trust the returned detail id/title/status: resolveRollup (`src/commands/tasks.ts:144-158`, already tracked separately as LORE-125) and lore link pre-write validation plus back-ref edit paths (`src/commands/link.ts:180`, `212`, `346`). A misbehaving or ambiguous adapter could attribute the wrong task data in `lore tasks` and `lore link`. This task covers the link.ts consumers; LORE-125 covers resolveRollup. Same bug class as LORE-122.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The lore link viewTask-consuming paths (pre-write validation and back-ref edit around `src/commands/link.ts:180`, `212`, `346`) verify the returned BacklogTaskDetail id matches the requested id case-insensitively (matching LORE-122 discipline) and refuse to use a mismatched detail.
- [ ] #2 A regression test drives a link path with a stubbed adapter returning a mismatched id and asserts the operation refuses rather than writing the wrong task data into the managed block or back-ref.
<!-- AC:END -->
