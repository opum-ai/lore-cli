---
id: LCLI-370
title: >-
  Backlog.md adapter has no discriminated version-floor failure class, unlike
  Quest's
status: To Do
assignee: []
created_date: '2026-08-31 16:56'
updated_date: '2026-08-31 17:10'
labels: []
dependencies: []
type: bug
ordinal: 497000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/adapters/quest.ts marks a below-the-floor Quest as QUEST_VERSION_FLOOR_CODE (isQuestVersionFloorFailure), which is the one probe failure init.ts treats as fatal-before-persist (LCLI-356 AC#2, and now also the wizards own default-answer path) rather than advisory. src/adapters/backlog.ts has an equivalent MIN_BACKLOG_VERSION floor (1.49.0) but no discriminated code - a below-floor Backlog.md and a merely-uninitialized one both surface as the same validation-tier LoreError, so verifyBackendReadiness can never treat a Backlog floor failure as fatal the way it does Quests.

Surfaced 2026-08-31 while extending verify-before-persist to lore inits wizard (opag ruling 1). This is an asymmetry between the two adapters, not something tied to which backend is the default: whichever tracker a user explicitly selects, a below-floor Quest is refused before commitment while a below-floor Backlog.md is not - a --tracker backlog user gets weaker protection than a --tracker quest user gets today, purely because one adapter has a discriminated floor code and the other does not. (An earlier version of this description framed the gap as something that moves when the zero-config default flips between quest and backlog; that framing was tied to a since-reverted default change and no longer applies - the asymmetry described above is the real, standing reason this is worth closing.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decide whether LORE-260's zero-config default path should ever be probed at all, or whether a discriminated backlog floor code is only useful for the wizard/explicit paths that already probe
- [ ] #2 If probing the default path is approved, src/adapters/backlog.ts gains a discriminated floor code (e.g. BACKLOG_VERSION_FLOOR_CODE) mirroring QUEST_VERSION_FLOOR_CODE, with an isBacklogVersionFloorFailure predicate
- [ ] #3 verifyBackendReadiness in src/commands/init.ts is updated to treat a below-floor Backlog.md as fatal the same way it treats a below-floor Quest, with test coverage proving both acceptance and rejection
- [ ] #4 If LORE-260 is reaffirmed instead, this task is closed recording that decision and its reasoning rather than left open indefinitely
<!-- AC:END -->
