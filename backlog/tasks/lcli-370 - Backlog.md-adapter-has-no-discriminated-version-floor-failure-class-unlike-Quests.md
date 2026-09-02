---
id: LCLI-370
title: >-
  Backlog.md adapter has no discriminated version-floor failure class, unlike
  Quest's
status: Done
assignee: []
created_date: '2026-08-31 16:56'
updated_date: '2026-09-02 22:15'
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
- [x] #1 Decide whether LORE-260's zero-config default path should ever be probed at all, or whether a discriminated backlog floor code is only useful for the wizard/explicit paths that already probe
- [x] #2 If probing the default path is approved, src/adapters/backlog.ts gains a discriminated floor code (e.g. BACKLOG_VERSION_FLOOR_CODE) mirroring QUEST_VERSION_FLOOR_CODE, with an isBacklogVersionFloorFailure predicate
- [x] #3 verifyBackendReadiness in src/commands/init.ts is updated to treat a below-floor Backlog.md as fatal the same way it treats a below-floor Quest, with test coverage proving both acceptance and rejection
- [x] #4 If LORE-260 is reaffirmed instead, this task is closed recording that decision and its reasoning rather than left open indefinitely
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 22:15
---
Decision on AC#1: REAFFIRM LORE-260. The zero-config default path (a bare `lore init` with no --tracker flag) does not gain a version probe. That path's whole design point -- established at LORE-260 and protected by its own tests -- is that a bare init spawns zero tracker subprocesses, synchronously, unconditionally. Adding a version-floor probe there would reintroduce exactly the "implied backlog check" LORE-260 deliberately removed, to guard a scenario (a below-floor Backlog.md on a run that never selected any tracker) that isn't the reported asymmetry in the first place.

The actual reported gap -- an explicit `--tracker backlog` user getting weaker protection than a `--tracker quest` user -- is fully closed by AC#2/#3, which apply to explicit selection (and the wizard's own default-answer path, per opag's 2026-08-31 ruling) regardless of this decision. Implemented: BACKLOG_VERSION_FLOOR_CODE + isBacklogVersionFloorFailure in src/adapters/backlog.ts, mirroring QUEST_VERSION_FLOOR_CODE exactly; verifyBackendReadiness in init.ts now re-throws it alongside the Quest floor and workspace-not-initialized failures. Test coverage: a new belowFloorBacklogAdapter test proves rejection (mirroring the existing Quest floor test), and the pre-existing acceptance-path tests (a real, capable backlog install) prove the happy path is untouched.
---
<!-- COMMENTS:END -->
