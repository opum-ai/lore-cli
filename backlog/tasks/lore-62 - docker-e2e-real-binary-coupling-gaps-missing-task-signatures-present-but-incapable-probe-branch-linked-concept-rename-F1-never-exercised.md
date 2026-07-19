---
id: LORE-62
title: >-
  docker/e2e real-binary coupling gaps: missing-task signatures,
  present-but-incapable probe branch, linked-concept rename (F1) never exercised
status: To Do
assignee: []
created_date: '2026-07-19 22:59'
labels:
  - e2e
  - testing
  - backlog-fork
  - adapter
dependencies:
  - LORE-56
  - LORE-61
references:
  - docker/e2e/run-e2e.sh
  - src/adapters/backlog.ts
  - src/commands/rename.ts
priority: high
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A multi-agent coverage audit of docker/e2e (2026-07-19, dev @ b8a4667; adversarially verified) found three high-risk real-binary coupling paths with zero E2E coverage — all in the exact LORE-57/58/59/60 bug class the harness exists to catch (upstream Backlog.md output-shape drift that mocked unit tests cannot see):

**1. Missing-task signatures never observed.** lore's classification of "task missing" rests on two raw output contracts with the pinned binary, neither ever exercised: viewTask's exit-1-plus-EMPTY-stdout signature (src/adapters/backlog.ts:696-715) and editTask's `/not found/i` stderr regex (backlog.ts:799). Every dependent path is untested: link's fail-before-write not_found/exit-3 on a nonexistent id; sync/check exit 3 when a linked task id vanishes; `lore tasks` soft-dropping a dangling id (stderr warning, exit 0). The harness never references a task id Backlog does not know (run-e2e.sh L165-190 links only valid TASK1/TASK2; the drift injection at L255 changes doc status, not task existence). If upstream changes its missing-task output shape, lore silently reclassifies not_found-3 as drift-6 or drops tasks — only a real-binary test can see it.

**2. Capability-probe exit-6 branch runs against nothing.** Only the missing-binary half of the LORE-60 split is tested (exit 3, twice: L209/L214). The present-but-incapable half — version below the 1.47.1 floor, or version-capable but the dry `task list --json` probe fails (probeBacklog, backlog.ts:154-221) → validation/exit 6 refusing coupling commands — never runs, because the image ships only the capable pinned build (Dockerfile L27-53). A 3-line stub shell script on a shadowed PATH (one printing an old semver, one printing non-JSON) covers both variants cheaply. This is the branch that fires the day upstream's --json output drifts.

**3. rename's Backlog coupling never fires.** rename only ever targets the Reference doc (L293), which has no linked tasks — the Story, the only linked concept, is never renamed. So moveBackRefs (real `task edit` label/--doc moves against the real binary), the per-write backlog commit, and rename's unique F1 failure asymmetry (success-shaped rename.result envelope STILL on stdout WITH exit 6 by return on a back-ref/commit failure — src/commands/rename.ts:203, deliberately different from link/unlink's throw) all have zero coverage. Same shells-real-backlog class that produced LORE-57.

The audit produced concrete proposed steps for each (raw-signature checks against `backlog task view/edit` of a nonexistent id; a hide-the-task-file mv around check/sync/tasks; PATH-shadowed stub binaries; a linked-concept rename plus a chmod-induced F1 case) — re-derive against the current script at execution time. F1 and the install-hint assertions need the step_fail helper from LORE-61.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Raw-signature checks pin the pinned binary itself: task view of a nonexistent id exits 1 with empty stdout; task edit of a nonexistent id reports not-found on stderr
- [ ] #2 lore-level consequences pinned: linking a nonexistent task id fails before writing (not_found/exit 3, frontmatter untouched); a vanished linked task makes check and sync exit 3; lore tasks soft-drops the dangling id (exit 0, warning on stderr)
- [ ] #3 Stub binaries on a shadowed PATH exercise the probe exit-6 branch both ways: version below the floor, and version-capable but not --json-capable
- [ ] #4 A LINKED concept rename exercises moveBackRefs and the per-write backlog commit against the real binary (envelope fields, the real task record, and a clean backlog/ tree asserted), and the F1 asymmetry — exit 6 by return with rename.result still on stdout — is pinned under an induced back-ref failure
- [ ] #5 The full harness runs green against the real pinned upstream binary, and teardown is clean
<!-- AC:END -->
