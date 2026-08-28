---
id: LCLI-356
title: >-
  Version gate rejects the shipped Quest 0.2.9: lore 0.3.4 and quest 0.2.9
  cannot interoperate
status: To Do
assignee: []
created_date: '2026-08-28 21:30'
updated_date: '2026-08-28 21:48'
labels:
  - release
  - quest
  - adapter
  - e2e
dependencies:
  - LCLI-353
priority: high
type: bug
ordinal: 477000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Installed lore 0.3.4 refuses installed quest 0.2.9. Every lore command that touches the quest tracker backend exits 6 with error_type=validation, message '`quest --version` did not return a supported Quest 0.2 version', hint 'Quest 0.2.7 or 0.2.8 is required'. Quest 0.2.9 is published on npm and is what a user gets today, so the two current releases of the pair cannot be used together.

Root cause is the frozen bounded allow-list introduced by LCLI-353: SUPPORTED_QUEST_VERSIONS=[0.2.7, 0.2.8], whose tests deliberately assert rejection of 0.2.9. The set was correct when written and went stale the moment quest shipped 0.2.9.

Two distinct problems:

1. The set does not include 0.2.9.
2. The gate fails LATE. 'lore init --yes --tracker quest' still exits 0 and writes [tracker] backend=quest, so the user is committed to the backend before anything refuses. Every subsequent tracker-touching command then fails. A gate that rejects a version should reject it at selection time, not after the workspace is configured.

Reproduction (2 commands in an empty git repo, quest 0.2.9 + lore 0.3.4 installed):

  quest init --json                                # exit 0
  lore init --yes --tracker quest --json           # exit 0  <-- accepts the backend
  lore orphans --json                              # exit 6  <-- refuses the version
  # {"error_type":"validation","message":"`quest --version` did not return a supported Quest 0.2 version","hint":"Quest 0.2.7 or 0.2.8 is required","principal":null}

Evidence: opum-cli-e2e baselines/v0.2.9 (407 rows, quest 0.2.9 native sha256 cf10a0fe3ad4, lore 0.3.4, host darwin-arm64). 10 of the 17 failing rows are this one defect: 6 in contract/lore (orphans, impact, export, snapshot list, the manifest golden cross-check, and the unknown-id diagnostic which now reports validation instead of not_found because the gate fires before the id lookup) and 4 in cross-product (Story-task linking, live rollup, missing-task not_found, unlink/rename back-reference repointing).

Also unblocks LCLI-353 AC#3, which was BLOCKED on quest 0.2.8 never being published. Quest 0.2.9 IS published, and the paired installed E2E is already green for every non-gate assertion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The supported-version gate accepts the shipped Quest 0.2.9 and every version the adapter is actually compatible with, with test-first coverage proving acceptance and proving rejection of a genuinely unsupported version
- [ ] #2 The gate is evaluated at tracker-selection time: 'lore init --tracker quest' against an unsupported quest fails with a classified diagnostic and does NOT write [tracker] backend=quest, so a user is never committed to a backend that will refuse every later command
- [ ] #3 A version rejection reports error_type=not_found for an unknown concept id rather than masking the id lookup behind the gate, so diagnostics stay truthful about what actually failed
- [ ] #4 The bounded-allow-list design is revisited or explicitly re-affirmed with its release-coupling cost recorded: as written, every Quest patch release requires a new Lore release before the pair works
- [ ] #5 Paired installed E2E against the exact published quest 0.2.9 passes link/back-reference, sync, tasks rollup, and validate/check --strict, closing LCLI-353 AC#3
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-28 21:48
---
Product owner decision, 2026-08-28: replace the bounded exact-match set with a MINIMUM version floor (accept >= the floor), matching src/adapters/backlog.ts's MIN_BACKLOG_VERSION shape. This reverses LCLI-353's deliberate 'bounded set, no unbounded range' choice, whose merged tests (PR #430) assert rejection of 0.2.9 — those assertions need rewriting, not just extending. Raised during the lore init onboarding review (LCLI-358); LCLI-358.2 and LCLI-358.6 both depend on this landing.
---
<!-- COMMENTS:END -->
