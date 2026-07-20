---
id: LORE-63
title: >-
  docker/e2e: reconciliation never value-asserted; custom status flows and the
  .lore/config.toml surface never run (defaults-only E2E)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-19 22:59'
updated_date: '2026-07-20 13:00'
labels:
  - e2e
  - testing
  - sync
  - backlog-fork
dependencies:
  - LORE-56
references:
  - docker/e2e/run-e2e.sh
  - src/commands/reconcile-shared.ts
  - src/adapters/backlog.ts
priority: high
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A multi-agent coverage audit of docker/e2e (2026-07-19, dev @ b8a4667; adversarially verified) found the reconciliation loop — the harness's core value proposition, the LORE-59-class doc↔task coupling surface — is never VALUE-asserted, and only ever runs against the three default statuses:

**1. Reconciliation is never value-asserted.** sync and check share the exact same engine (gatherReconciliation/reconcileStatus/regenerateTaskBlock, src/commands/reconcile-shared.ts:140-178), so check's clean-bundle gates only prove sync wrote something SELF-CONSISTENT — any self-consistent regression (a wrong-but-stable reconciled status, wrong row content) passes the whole harness. No assertion checks rendered managed-block rows against status literals. Additionally `filesChanged >= 1` is never asserted on the first post-mutation sync (L224-225 asserts only backlogCommit.committed, satisfiable by the harness's own dirty backlog/ files), which makes the L230 idempotency assertion trivially satisfiable — today the harness stays green even if sync writes nothing after the phase-6 mutation.

**2. The managed-BLOCK drift branch never fires.** The only induced drift is a frontmatter sed (L255); corrupting the block BODY (e.g. flipping a rendered status cell) — the other half of check's drift detection — is never exercised.

**3. Custom status flows never run.** sync/check read the ordered status flow from backlog/config.yml — a file the REAL pinned binary writes and mutates — on every run, but the harness never customizes it, so reconciliation E2E only ever sees the three defaults (the hardcoded-defaults trap LORE-26 exists to prevent). Never exercised: a non-default status flowing through reconcile; parseStatusFlow's validation-6 fail-loud branches (backlog.ts:841-877); whether upstream's emitted config.yml shape stays parseable by lore (an upstream statuses-shape change would break every real sync/check at exit 6 while the harness stays green — exactly the coupling-drift class only this harness can pin).

**4. The .lore/config.toml surface never runs.** [reconcile.overrides] + validateReconcileInputs (the documented recovery path for teams with custom statuses) and the malformed-TOML fail-loud path are untested; every run uses the zero-config default.

Side finding for awareness (doc-side, tracked in the docs task): the two documented validate knobs in src/core/config.ts:65-70 are parsed but have zero consumers.

The audit produced concrete proposed steps (strengthen the L224-225 jq filter; literal-grep row checks; a block-body sed inducement; `backlog config set statuses` written the way the binary writes it; malformed statuses + malformed TOML fail-loud cases) — re-derive against the current script at execution time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The first post-mutation sync asserts filesChanged >= 1 (not just backlogCommit.committed), and rendered managed-block rows are value-asserted against concrete status literals
- [x] #2 Managed-BLOCK body drift is induced (not just frontmatter drift): check catches it at exit 6 and sync heals it back to 0
- [x] #3 A custom non-default status flow, written the way the real binary writes it, reconciles end-to-end; a malformed statuses shape fails loud at exit 6
- [x] #4 The .lore/config.toml surface is exercised: [reconcile.overrides] is honored E2E and a malformed config fails loud
- [x] #5 The full harness runs green against the real pinned upstream binary, and teardown is clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AC1: strengthen Phase 6's first post-mutation sync jq filter to require filesChanged >= 1 (not
   just backlogCommit.committed); value-assert the rendered managed-block rows for TASK1/TASK2
   against concrete status literals, anchored on the row's "[TASK-n]" link text (not a bare
   substring grep, which also hits the frontmatter tasks: line and can prefix-collide).
2. AC2: in Phase 9's drift loop, after the existing frontmatter-drift induce/heal, corrupt the
   managed-block BODY directly (sed the rendered "In Progress" cell) and assert check/sync/check
   catch-heal-clean, distinct from the frontmatter case.
3. AC3: new Phase 15c. Re-derive how the real backlog binary persists a custom status flow (no
   CLI setter exists -- config set statuses refuses; edit backlog/config.yml's statuses: directly,
   the same shape backlog init writes). Use a FRESH, isolated Story (only Story ships the managed
   block by default) linked to one task with a non-default status ("Review") so the rollup is
   driven purely by that task; assert sync reconciles it end-to-end and the block renders the
   literal. Then corrupt statuses: to a non-list shape and assert parseStatusFlow's exit-6
   validation fires.
4. AC4: same isolated Story. Write .lore/config.toml's [reconcile.overrides] mapping the custom
   status to a DIFFERENT rollup than its flow position would produce, and assert the override
   wins (proves it's actually read, not coincidence). Then set an invalid override target and
   assert core/reconcile.ts's own validation fires at exit 6. Re-heal the probe Story and restore
   backlog/config.yml afterward so no phase leaves contradictory/altered shared state behind.
5. AC5: verify the whole diff against the real docker/e2e harness (build + run + down -v), plus
   bun test, before and after an independent adversarial review pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented all 4 content ACs in docker/e2e/run-e2e.sh (no src/ changes -- this is a harness-only task):
- Phase 6: filesChanged >= 1 added to the jq filter; TASK1/TASK2 managed-block rows value-asserted
  against "In Progress"/"Done" literals.
- Phase 9: new managed-block BODY drift induce/catch/heal/clean block, following the existing
  frontmatter-drift block.
- New Phase 15c (between 15b and 16): custom 4-status flow (To Do/In Progress/Review/Done) written
  directly to backlog/config.yml (confirmed via the real local backlog v1.48.0 binary that `backlog
  config set statuses ...` refuses -- there is no CLI setter); a fresh, singly-linked Story proves
  the custom status reconciles end-to-end and a malformed statuses: shape fails loud (exit 6,
  validation). Then .lore/config.toml's [reconcile.overrides] on the same isolated Story: an
  override to a DIFFERENT rollup than flow position would give proves the override is actually
  honored; an invalid override target fails loud (exit 6, validation). Restored backlog/config.yml
  and re-healed the probe Story's status at the end so no contradictory state is left for any later
  phase.

Verification: two full `docker compose -f docker/e2e/docker-compose.yml up --build` runs (125/0
then, after review fixes, 127/0 failed, exit 0 both times; `down -v` clean both times) --
docker/e2e/run-e2e.sh is the AC5 evidence, `bun test` alone does not cover it (1500/1500 throughout,
unaffected since no src/ changed).

Independent adversarial review (subagent) after the first green run found 2 real issues and fixed
them before the final run: (1) the new TASK1/TASK2/TASK6 status-value greps were unanchored
substring matches that also hit the frontmatter tasks: line and could prefix-collide past 9 tasks
-- fixed to anchor on the row's literal "[TASK-n]" link-text bracket, which only appears in the
managed-block row; (2) the override test left the probe Story's on-disk status ("done") drifted
from live data once .lore/config.toml was removed (dormant -- nothing later re-checks that Story,
but inconsistent with the rest of the file's leave-no-induced-state-behind convention) -- fixed by
re-heal-syncing the Story and restoring backlog/config.yml's original flow at the end of Phase 15c.
Also fixed a minor RC-guard gap on the new Story's jq extraction to match Phase 3's existing
convention.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed all 4 coverage gaps in docker/e2e/run-e2e.sh's reconciliation testing (harness-only change,
no src/ touched): (1) the first post-mutation sync now asserts filesChanged >= 1 and the rendered
managed-block rows are value-asserted against concrete status literals; (2) managed-block BODY
drift (a corrupted rendered status cell) is now induced, caught by check (exit 6), and healed by
sync, distinct from the pre-existing frontmatter-drift case; (3) a custom, non-default 4-status
flow -- written directly to backlog/config.yml the way the real binary actually persists it, since
there is no CLI setter -- now reconciles end-to-end on an isolated Story, and a malformed statuses:
shape fails loud at exit 6; (4) .lore/config.toml's [reconcile.overrides] surface is now exercised
end-to-end (an override provably wins over flow position) and an invalid override target fails
loud at exit 6.

Verified with two full real-binary `docker compose -f docker/e2e/docker-compose.yml up --build`
runs (125/0 failed, then 127/0 failed after an independent adversarial review found and fixed two
real issues -- unanchored substring greps that could match the wrong line/task, and a dormant
status-drift left behind after the override test), `down -v` clean both times, and `bun test`
1500/1500 throughout.
<!-- SECTION:FINAL_SUMMARY:END -->
