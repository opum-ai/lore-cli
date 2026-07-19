---
id: LORE-63
title: >-
  docker/e2e: reconciliation never value-asserted; custom status flows and the
  .lore/config.toml surface never run (defaults-only E2E)
status: To Do
assignee: []
created_date: '2026-07-19 22:59'
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
- [ ] #1 The first post-mutation sync asserts filesChanged >= 1 (not just backlogCommit.committed), and rendered managed-block rows are value-asserted against concrete status literals
- [ ] #2 Managed-BLOCK body drift is induced (not just frontmatter drift): check catches it at exit 6 and sync heals it back to 0
- [ ] #3 A custom non-default status flow, written the way the real binary writes it, reconciles end-to-end; a malformed statuses shape fails loud at exit 6
- [ ] #4 The .lore/config.toml surface is exercised: [reconcile.overrides] is honored E2E and a malformed config fails loud
- [ ] #5 The full harness runs green against the real pinned upstream binary, and teardown is clean
<!-- AC:END -->
