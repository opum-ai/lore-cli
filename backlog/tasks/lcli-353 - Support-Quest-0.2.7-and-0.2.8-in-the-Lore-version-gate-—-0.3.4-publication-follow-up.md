---
id: LCLI-353
title: >-
  Support Quest 0.2.7 and 0.2.8 in the Lore version gate — 0.3.4 publication
  follow-up
status: Done
assignee:
  - '@claude'
created_date: '2026-08-28 00:02'
updated_date: '2026-08-29 23:39'
labels:
  - release
  - quest
  - adapter
dependencies:
  - LCLI-352
priority: high
type: bug
ordinal: 474000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #1 Version gate accepts exactly Quest 0.2.7 and 0.2.8 (bounded set, no unbounded range) with structured-criteria validation retained; test-first coverage proves acceptance of both and rejection of other versions with hints naming the supported set; #2 install/drift hints name the supported set everywhere the old single-version hint appeared; #3 paired packed/installed E2E against the exact Quest 0.2.8 candidate: link/back-reference, sync, tasks rollup, validate/check strict, and the public quest task-binding contract through the Opum facade; #4 0.3.4 candidate/provenance/dry-run regenerated only after merge to dev, earlier f4aefe3 candidate invalidated; no npm publish/login/MFA/auth/dist-tag or registry writes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test-first version-gate coverage. 2. Bounded SUPPORTED_QUEST_VERSIONS gate + hint updates. 3. Focused tests + full suite + lint/typecheck. 4. PR to dev, green merge. 5. Paired E2E vs exact quest 0.2.8 candidate incl. task-binding contract. 6. Regenerate 0.3.4 candidate/provenance/dry-run from a fresh publish:false Release run; invalidate f4aefe3 candidate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Settled 2026-08-29 as SUPERSEDED BY LCLI-356, not as delivered-as-written. Read AC#1 before treating this as a normal completion: it required 'exactly Quest 0.2.7 and 0.2.8 (bounded set, no unbounded range)'. That design was deliberately REVERSED by a product-owner decision on 2026-08-28, so this task's own acceptance criterion no longer describes what ships. It is checked because the work it stood for is done, by a different and better design; it is not checked because a bounded set was built and kept.

What actually shipped (LCLI-356, on dev): SUPPORTED_QUEST_VERSIONS is gone. MIN_QUEST_VERSION = '0.2.7' with a >= comparison replaces it, matching src/adapters/backlog.ts's MIN_BACKLOG_VERSION shape. backlog.ts's private parseSemver/compareSemver were extracted to a shared adapters/semver.ts rather than copied, so both adapters compare versions one way. This task's merged tests (PR #430) asserted REJECTION of 0.2.9 and had to be rewritten, not extended.

Why the reversal was right, recorded so nobody re-litigates it: the bounded set went stale the moment quest published 0.2.9, and the two then-published packages could not be used together at all. Restoring the pair required a third release shipped solely to add a string to a list. The rationale and the release-coupling cost are in docs/adr/0020-tracker-version-gates-are-minimum-floors.md. A floor is safe because the version is not what enforces compatibility — every Quest call already validates schemaVersion, envelope kind, data presence, and the required command set, so a contract break is caught structurally.

AC#3's blocker is also resolved but the AC itself is NOT closed here. It required a paired E2E against an exact quest 0.2.8 candidate, and 0.2.8 was never published. Quest 0.2.9 IS published, so the pairing is now qualifiable — and that qualification is tracked as LCLI-356 AC#5, owned by the opum-cli-e2e session (a live session named e2e-qualify-lore-quest). Do not read this task's closure as evidence the pair has been qualified. LCLI-356 stays In Progress precisely because it has not been.

Cross-repository state confirmed with the quest-cli session on 2026-08-29: quest's TRACKER_CONTRACT_VERSION is still 1, and its v0.2.9..dev diff is purely additive (task list filters 2 -> 13, added task edit operations, no required command removed or renamed). Lore's verifyManifest is a per-command subset check asserting only name/schemaVersion/kind/mutates, so that growth is invisible to it. Quest is cutting 0.3.0; the >= floor accepts it with no further lore change.
<!-- SECTION:NOTES:END -->
