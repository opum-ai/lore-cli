---
id: LCLI-370
title: >-
  Backlog.md adapter has no discriminated version-floor failure class, unlike
  Quest's
status: To Do
assignee: []
created_date: '2026-08-31 16:56'
labels: []
dependencies: []
type: bug
ordinal: 497000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/adapters/quest.ts marks a below-the-floor Quest as QUEST_VERSION_FLOOR_CODE (isQuestVersionFloorFailure), which is the one probe failure init.ts treats as fatal-before-persist (LCLI-356 AC#2) rather than advisory. src/adapters/backlog.ts has an equivalent MIN_BACKLOG_VERSION floor (1.49.0) but no discriminated code — a below-floor Backlog.md and a merely-uninitialized one both surface as the same validation-tier LoreError, so verifyBackendReadiness can never treat a Backlog floor failure as fatal the way it does Quest's.

Surfaced 2026-08-31 while extending verify-before-persist to lore init's zero-config default (opag rulings 1/2, PR fixing the default-tracker-flips-to-backlog change). Flipping the silent default from quest to backlog neutralizes the immediate repro (a machine that actually has backlog installed), but the underlying defect class does not disappear — it moves: a bare lore init on a machine with a below-floor (or missing) backlog binary still silently persists an unusable default, exactly as an uninstalled quest did before. LORE-260 (bare init never spawns a tracker subprocess) means this default path is deliberately never probed at all, so this is not fixable by probing alone without first deciding whether LORE-260 should be revisited — a separate decision, out of scope here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decide whether LORE-260's zero-config default path should ever be probed at all, or whether a discriminated backlog floor code is only useful for the wizard/explicit paths that already probe
- [ ] #2 If probing the default path is approved, src/adapters/backlog.ts gains a discriminated floor code (e.g. BACKLOG_VERSION_FLOOR_CODE) mirroring QUEST_VERSION_FLOOR_CODE, with an isBacklogVersionFloorFailure predicate
- [ ] #3 verifyBackendReadiness in src/commands/init.ts is updated to treat a below-floor Backlog.md as fatal the same way it treats a below-floor Quest, with test coverage proving both acceptance and rejection
- [ ] #4 If LORE-260 is reaffirmed instead, this task is closed recording that decision and its reasoning rather than left open indefinitely
<!-- AC:END -->
