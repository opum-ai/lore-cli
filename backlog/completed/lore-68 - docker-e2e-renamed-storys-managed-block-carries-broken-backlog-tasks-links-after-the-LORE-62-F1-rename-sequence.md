---
id: LORE-68
title: >-
  docker/e2e: renamed-story's managed block carries broken backlog/tasks/ links
  after the LORE-62 F1 rename sequence
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-20 13:36'
updated_date: '2026-07-20 21:10'
labels:
  - e2e
  - bug
  - backlog-coupling
dependencies: []
priority: medium
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Discovered while implementing LORE-64 (declarative profile subsystem E2E coverage): a full `lore check --json` run against docker/e2e's scratch bundle, right after Phase 17 (schema export) and before any profile-subsystem changes, already reports 2 broken-link errors that have nothing to do with LORE-64:

```
{"severity":"error","rule":"broken-link","file":"stories/e2e-renamed-story-f1.md","message":"link \"../backlog/tasks/task-1%20-%20Design-the-archive-endpoint.md\" points at \"backlog/tasks/task-1 - Design-the-archive-endpoint.md\", which is not in the bundle"}
{"severity":"error","rule":"broken-link","file":"stories/e2e-renamed-story-f1.md","message":"link \"../backlog/tasks/task-2%20-%20Implement-the-archive-job.md\" points at \"backlog/tasks/task-2 - Implement-the-archive-job.md\", which is not in the bundle"}
```

This is a genuine, pre-existing gap: nothing in run-e2e.sh runs a full, unscoped `lore check` between Phase 9's drift loop and Phase 24's targeted exit-code checks, so this has silently gone undetected through every session of the backlog-campaign since Phase 15b/16 (the linked-rename + F1-induced-failure + supersede sequence) first ran.

Root-cause hypothesis (not yet confirmed): `src/core/managed-block.ts`'s `renderRow` builds each row's link from the linked task's own `file` field (the task's repo-relative path as Backlog's adapter reports it) via `normalizeLink`/`encodePathSegments`. The broken link's encoding is a mix of literal dashes ("Design-the-archive-endpoint") and %20-encoded spaces ("task-1%20-%20") in the SAME string — `encodePathSegments` only percent-encodes characters that are actually present in its input, so the dashes must already be in the `file` value the adapter reported, while the real on-disk filename apparently uses spaces instead (title created verbatim as "Design the archive endpoint" via `backlog task create`). That mismatch (Backlog's reported task file path using dashes where the real filename uses spaces, or vice-versa) looks like the same family of "Backlog.md's own data representation vs. its real filesystem convention diverge" issues already found in LORE-62 (task-id casing) and LORE-63 (status representation) — but this specific divergence (the task file PATH itself) has not been investigated.

Likely introduced during the Phase 15b linked-rename + F1-induced-backref-failure sequence (docker/e2e/run-e2e.sh), since the Story renamed there ("stories/e2e-renamed-story" -> "stories/e2e-renamed-story-f1") is the one file affected, and its managed-block row links were never regenerated (`lore sync`) after that rename.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root-cause confirmed: identify exactly which value (adapter-reported task file path vs. the real on-disk backlog/tasks/ filename) carries the wrong dash/space convention, and in which lore module or which real backlog binary behavior it originates
- [x] #2 docker/e2e/run-e2e.sh's Phase 15b/16 sequence (or wherever the real cause lives) fixed so a full, unscoped 'lore check --json' run after Phase 17 (schema export) shows 0 broken-link findings
- [x] #3 A full docker/e2e harness run (docker compose -f docker/e2e/docker-compose.yml up --build) is green, and a full 'lore check' at that point in the script is added as a regression guard so this gap cannot silently recur
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce headlessly (no docker) via a scratch lore+backlog project: Story + linked task, sync, rename, lore check.
2. Trace root cause: src/core/rewrite.ts's newDestPathFor resolves the moved file's own outbound links in BUNDLE-relative coordinate space (concept.path/ctx.toPath, no docs/ prefix), but normalizeLink's contract requires REPO-relative operands. The two coincide for links that stay inside the bundle (a constant docs/ prefix cancels in a relative-path computation) but diverge for a link that escapes the bundle root (a Story's managed task block linking backlog/tasks/) -- losing exactly one ../ segment on every rename.
3. Fix: prefix DOCS_DIR onto the dir/toPath operands passed to normalizeLink in newDestPathFor (both isMoved branches), keeping the existing bundle-relative targetId computation for self-link/graph-membership matching.
4. Add unit test coverage in test/rename.test.ts proving the escaping link survives a same-directory rename and correctly gains a segment on a depth-changing move; confirmed both tests fail without the fix (git stash) and pass with it.
5. Add a permanent full-unscoped 'lore check' regression guard (Phase 17a) in docker/e2e/run-e2e.sh right after Phase 17 (schema export), asserting errorCount==0 and warningCount==0.
6. Real harness run surfaced a second, adjacent gap: Phase 15c's cleanup restores backlog/config.yml's status flow but leaves TASK6 on the now-unrecognized 'Review' status, which the new Phase 17a guard trips over (validation ErrorEnvelope, exit 6) -- fixed by resetting TASK6 to a default-flow status and re-syncing at the end of Phase 15c.
7. Verify: bun test (full suite), full docker/e2e harness (docker compose up --build, down -v).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed (AC1): NOT the dash-vs-space filename theory the filing task hypothesized -- src/adapters/backlog.ts's file field is passed through verbatim from the real backlog task-view --json path, unmodified. The real bug is src/core/rewrite.ts's newDestPathFor: it resolves the moved file's own outbound links using the bundle-relative coordinate space (concept.path/ctx.toPath, no docs/ prefix) instead of the repo-relative space normalizeLink's own contract requires. Reproduced headlessly (scratch lore+backlog project, pinned MrLesk/Backlog.md @ 22a091b -- the --json PR #790 commit, built locally) with zero docker: link ../../backlog/tasks/x.md became ../backlog/tasks/x.md after a SAME-directory rename; lore check then reported it broken. Confirmed the fix is general with a depth-changing-move repro too (correctly gains a segment).

Fix (AC2): src/core/rewrite.ts newDestPathFor now prefixes DOCS_DIR onto the dir/toPath operands before calling normalizeLink (both isMoved sub-cases), while keeping the existing bundle-relative targetId computation for self-link/graph-membership matching untouched. Added 2 new unit tests in test/rename.test.ts (same-directory truncation regression + depth-changing scaling) -- verified BOTH fail without the fix via git stash, pass with it. Full bun test: 1502/1502 pass. tsc --noEmit clean.

Regression guard (AC3): added Phase 17a to docker/e2e/run-e2e.sh -- a full, unscoped 'lore check --json' right after Phase 17 (schema export), asserting errorCount==0 and warningCount==0, positioned between Phase 9's drift loop and Phase 24 per the task's own wording. First real harness run surfaced a second, adjacent pre-existing gap the new guard exposed: Phase 15c's cleanup restores backlog/config.yml's status flow but leaves TASK6 (created for the custom-status-flow probe) on the now-unrecognized 'Review' status with no override -- the first full check to touch that Story again throws a validation ErrorEnvelope (exit 6) trying to reconcile it. Fixed by resetting TASK6 to a default-flow status ('Done') and re-syncing once more at the end of Phase 15c, completing that phase's own 'leave no induced state behind' cleanup. Not a LORE-68 root-cause issue -- a separate, adjacent test-hygiene gap the new AC3 guard was the first thing ever to exercise.

Full verification (AC2/AC3): real docker/e2e harness, docker compose -f docker/e2e/docker-compose.yml up --build -- 299 passed, 0 failed, exit 0 (up from 295/0 pre-fix since 4 new steps were added); down -v clean. bun test 1502/1502 throughout.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Root cause confirmed and fixed in src/: src/core/rewrite.ts's newDestPathFor recomputed a moved concept's outbound links in the bundle-relative coordinate space instead of normalizeLink's required repo-relative space -- silently correct for links staying inside docs/, silently truncating one ../ segment for a link escaping the bundle root (a Story's managed task block linking backlog/tasks/). Fixed by prefixing DOCS_DIR onto the normalizeLink operands; verified with a headless (no-docker) repro against the pinned MrLesk/Backlog.md --json binary, 2 new unit tests in test/rename.test.ts (confirmed to fail pre-fix via git stash), full bun test 1502/1502, and tsc clean. Added the permanent full-unscoped 'lore check' regression guard (Phase 17a) run-e2e.sh AC3 requires, and fixed an adjacent Phase 15c cleanup gap (a dangling non-default task status) the guard's first real run exposed. Verified end-to-end with the real docker/e2e harness: docker compose up --build -> 299 passed, 0 failed, exit 0; down -v clean.
<!-- SECTION:FINAL_SUMMARY:END -->
