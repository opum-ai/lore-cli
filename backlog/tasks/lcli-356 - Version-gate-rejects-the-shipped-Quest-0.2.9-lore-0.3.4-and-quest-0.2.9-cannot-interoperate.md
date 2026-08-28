---
id: LCLI-356
title: >-
  Version gate rejects the shipped Quest 0.2.9: lore 0.3.4 and quest 0.2.9
  cannot interoperate
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-28 21:30'
updated_date: '2026-08-28 23:15'
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
- [x] #1 The supported-version gate accepts the shipped Quest 0.2.9 and every version the adapter is actually compatible with, with test-first coverage proving acceptance and proving rejection of a genuinely unsupported version
- [x] #2 The gate is evaluated at tracker-selection time: 'lore init --tracker quest' against an unsupported quest fails with a classified diagnostic and does NOT write [tracker] backend=quest, so a user is never committed to a backend that will refuse every later command
- [x] #3 A version rejection reports error_type=not_found for an unknown concept id rather than masking the id lookup behind the gate, so diagnostics stay truthful about what actually failed
- [x] #4 The bounded-allow-list design is revisited or explicitly re-affirmed with its release-coupling cost recorded: as written, every Quest patch release requires a new Lore release before the pair works
- [ ] #5 Paired installed E2E against the exact published quest 0.2.9 passes link/back-reference, sync, tasks rollup, and validate/check --strict, closing LCLI-353 AC#3
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification (2026-08-28). AC#1-#4 done here; AC#5 belongs to another repository (see below).

AC#1 — the floor. SUPPORTED_QUEST_VERSIONS replaced by MIN_QUEST_VERSION = 0.2.7 with a >= comparison. adapters/backlog.ts's private parseSemver/compareSemver were extracted to a shared adapters/semver.ts rather than copied, and both adapters now use it. LCLI-353's assertions were rewritten, not extended: the test that required exactly [0.2.7, 0.2.8] and rejected 0.2.9 now proves acceptance of 0.2.7/0.2.8/0.2.9/0.3.0/1.0.0 and rejection of 0.1.0/0.2.6, with 'not a semver at all' kept as a distinct third failure. Live against the installed quest 0.2.9: trackerCheck reports {capable: true, version: '0.2.9'}, and `lore orphans` — the exact command the repro said exits 6 — returns its report at exit 0.

AC#2 — the gate is evaluated at selection time. verifySelectedBackend runs before persistTrackerBackend on the explicit --tracker path, so a rejected version never reaches [tracker].backend. Deliberately narrow, and the narrowness is the design: ONLY a below-the-floor rejection is fatal. An installed backend below the floor is a pairing that cannot work at all and nothing inside the repository fixes it; every other probe failure ('workspace is not initialized', 'not on PATH', 'no Backlog.md project') is one setup step away in the same directory, which is exactly why LORE-319 made this check advisory. This does not reverse LORE-319 — it carves out the one class LORE-319 was never about. Discriminated on a structured QUEST_VERSION_FLOOR_CODE marker, not on message text. Exemptions: none (nothing to verify), --no-tracker (documented opt-out for configuring a repository before installing its tooling), and jira (Lore cannot determine its readiness until LCLI-358.4 writes [tracker.jira]). The interactive wizard deliberately does not gate: LCLI-358.6/.7 replace its tracker step with an offer to install or initialize, and failing outright meanwhile would pre-empt that with a worse version of the same idea.

AC#3 — diagnostics stay truthful. Verified live in a real quest 0.2.9 workspace: `lore tasks nonexistent-concept` and `lore context does/not/exist` both return error_type=not_found with the id in input, no longer masked behind the gate.

AC#4 — the bounded-set design is revisited, not silently dropped. Recorded in docs/adr/0020-tracker-version-gates-are-minimum-floors.md, which states the release-coupling cost explicitly (two independently released packages needing a third release to be usable together, with a broken window in between) and the reason a floor is safe: the version is not what enforces compatibility. Every Quest call already validates schemaVersion, envelope kind, data presence, and the required command set, so a contract break is caught structurally with a drift diagnostic naming what changed, whether or not the version sat in an allowlist. Also records that pre-release identifiers are ignored, matching Backlog's long-standing behavior.

AC#5 — NOT done here, and not doable here. It asks for a paired installed E2E against the published quest 0.2.9, which lives in opum-cli-e2e (a live session named e2e-qualify-lore-quest is already in that repository) and needs a published or packed Lore build carrying this change. This task should not be closed on AC#5 without that run.

Validation: bun test 2708 pass / 0 fail / 1 skip; lint, typecheck, and lore check (76 files, 0 errors) all exit 0. Two docker/e2e cases added, bash -n clean, both assertions reproduced against the real CLI locally; the container could not run (docker info exits 1 on this host).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-28 21:48
---
Product owner decision, 2026-08-28: replace the bounded exact-match set with a MINIMUM version floor (accept >= the floor), matching src/adapters/backlog.ts's MIN_BACKLOG_VERSION shape. This reverses LCLI-353's deliberate 'bounded set, no unbounded range' choice, whose merged tests (PR #430) assert rejection of 0.2.9 — those assertions need rewriting, not just extending. Raised during the lore init onboarding review (LCLI-358); LCLI-358.2 and LCLI-358.6 both depend on this landing.
---

author: @claude
created: 2026-08-28 23:15
---
AC#1-#4 are complete and verified; the task stays In Progress because AC#5 is not doable in this repository. It requires a paired installed E2E against published quest 0.2.9, which lives in opum-cli-e2e and needs a packed or published Lore build carrying this change. A live session named e2e-qualify-lore-quest is already working in that repository. Do not close this task on AC#5 without that run.
---
<!-- COMMENTS:END -->
