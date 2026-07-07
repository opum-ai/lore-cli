---
id: LORE-50
title: >-
  dedupe multi-root check reconciliation: shared task ids + config validation
  across bundle roots
status: Done
assignee:
  - '@claude'
created_date: '2026-07-07 04:11'
updated_date: '2026-07-07 15:47'
labels:
  - cmd
dependencies:
  - LORE-27
priority: low
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore check's status/managed-block drift pass (LORE-27) resolves reconciliation independently per
bundle root when [paths...] names more than one root: each call to gatherReconciliation
(commands/reconcile-shared.ts) re-reads/re-validates backlog/config.yml and .lore/config.toml, and
re-resolves a task id via the Backlog adapter even if the SAME id is linked from concepts in two
different roots -- deduped only within one bundle root's own concepts, never across roots.

This was flagged three times across LORE-27's /code-review max rounds (1, 2, 3), each time
deliberately deferred as a correctness-neutral, narrow multi-root edge case (most real usage is the
single default docs/ root) whose proper fix -- gathering every bundle root's concepts into one
combined pool BEFORE calling gatherReconciliation, so config validation and task resolution both
happen exactly once for the whole run -- is a real restructuring of computeDriftFindings'
per-bundle-root loop, not a small change, and the review explicitly reclassified it as
performance/cleanup-grade (never correctness) every time.

Fix: restructure commands/check.ts's computeDriftFindings (and possibly
commands/reconcile-shared.ts's gatherReconciliation contract) so multi-root check gathers concepts
from every root first, resolves the union of linked task ids once, and validates
config/status-flow once -- while still attributing each per-concept finding back to its own bundle
root's label (the existing multi-root file-labeling convention must be preserved).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Multi-root lore check resolves each distinct linked task id at most once across the whole run, not once per bundle root
- [x] #2 Multi-root lore check validates backlog/config.yml and .lore/config.toml at most once across the whole run
- [x] #3 Per-concept drift findings are still correctly attributed to their own bundle root's label
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation: pooled reconciliation inputs in commands/check.ts's computeDriftFindings, resolved
once per run instead of once per bundle root.

- reconcile-shared.ts: new resolveTaskDetails(adapter, ids) — non-throwing, Promise.allSettled over
  every distinct id, returns Map<id, {ok:true,detail}|{ok:false,error}>. resolveAllTasks rebuilt on
  top of it (same throwing contract, used by sync.ts and any caller with no override). gatherReconciliation
  gained two new optional params: detailsOverride (a pre-resolved map; looked up instead of hitting the
  adapter) and configErrorOverride (a cached config-validation failure to re-throw at the same fail-fast
  point a fresh resolveReconcileConfig(root) call would have hit, without re-reading disk).
- check.ts: new resolveSharedReconciliation() pools every bundle root's eligible concepts BEFORE the
  per-root loop, resolving config once (try/caught, never rejects) and the id union once, then threads
  both into every root's driftFindingsForBundle -> gatherReconciliation call as overrides.

Regression caught by /code-review high and fixed before landing: an early version returned immediately
from computeDriftFindings when the pooled config resolution failed, which silently discarded every
bundle root's OWN already-known concept-scan error (tryConceptsForBundle) in favor of the generic
pooled config error -- breaking the documented "first error, in bundle-argument order" contract
(DriftResult's own doc comment). Fixed by never short-circuiting computeDriftFindings on a config
failure: the failure is now carried as PooledReconciliation.configError and only surfaces per-root,
at the exact point (and only for the roots) where gatherReconciliation's own eligibility check would
have hit it fresh -- so a root with no eligible concepts (like one whose only file failed to scan at
all) never sees it, exactly as before pooling existed. Added a regression test reproducing this exact
scenario (two roots, one with its own scan error listed first in argument order, one with a real
eligible concept behind a broken shared config) plus tests for the dedup itself (a task id linked
from two roots is fetched from Backlog exactly once) and for the shared config being applied
uniformly across roots.

Verification: bun run typecheck clean; full bun test suite 1282/1282 pass (8 new tests added across
check.test.ts/reconcile-shared.test.ts); bun run lint clean (3 pre-existing infos in unrelated files,
no new errors); each new test independently confirmed to fail against the pre-fix code before the fix
was applied (both the initial dedup regression and the config-priority regression /code-review high
caught).

Post-Done follow-up: ran /code-review max against PR #38 (the already-merged-to-branch,
not-yet-user-merged implementation). It found a second, more severe regression than the
one caught during implementation: resolveSharedReconciliation guarded resolveReconcileConfig
with try/catch but left the sibling resolveTaskDetails call unguarded -- a synchronously-
throwing adapter would reject computeDriftFindings itself, and since runCheck's
driftPromise.then has no .catch, the ENTIRE check.report (including already-computed
link/anchor findings) was silently dropped instead of emitted. Empirically confirmed as a
regression vs the pre-PR base and confirmed fixed. Pushed as commit f98dcde on the same
feature branch, plus: normalized configError (closes a PLAUSIBLE undefined-sentinel
collision), collapsed driftFindingsForBundle's positional pooled params into the existing
PooledReconciliation object, fixed an orphaned JSDoc (two new declarations had been
inserted between computeDriftFindings's doc comment and the function itself), and
tightened/corrected three tests the review flagged as either mistitled or overclaiming
coverage they didn't actually provide.

Deferred (lower severity, noted rather than risking further churn on this same code path):
linkedConcepts recomputed a 3rd time (cheap/pure, no IO); resolveSharedReconciliation
duplicates gatherReconciliation's own config-then-ids ordering as a second hand-synced copy.

Verification: bun run typecheck clean; full suite 1284/1284; lint clean (3 pre-existing
infos, no new errors); the critical fix was independently reproduced against a
synchronously-throwing adapter both before (report silently dropped) and after (report
correctly emitted) the fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pooled multi-root lore check's status/managed-block reconciliation: config (backlog/config.yml + .lore/config.toml) and every distinct linked task id are now each resolved at most once per run, not once per bundle root, while preserving the existing per-root failure isolation (a bad task id or a root's own scan error only fails that root; a shared config failure still surfaces at the same per-root fail-fast point). Verified with new tests for the dedup, the shared config, and (after /code-review high caught a real regression in an early version) a root's own scan error correctly outranking a shared config failure in argument order. Full suite 1282/1282, typecheck and lint clean.
<!-- SECTION:FINAL_SUMMARY:END -->
