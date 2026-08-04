---
id: LORE-197
title: >-
  Discovery advisories from an earlier bundle root are lost when a later root
  throws inside collectBundles (residual of LORE-191)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 14:08'
updated_date: '2026-07-23 19:18'
labels:
  - cmd-check
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 328500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem

`src/commands/check.ts` `runCheck` collects discovery advisories (a skipped symlink, an unreadable sub-directory) into a single `WarningCollector` (`src/commands/check.ts:145`) and — post-LORE-191 — flushes it **exactly once** at `src/commands/check.ts:161`, immediately AFTER `collectBundles(...)` **returns** (call at `src/commands/check.ts:146`). That flush ordering guarantees advisories survive a later `checkBundles` scan-phase throw or a reconciliation rejection (the LORE-191 fix).

But `collectBundles` (`src/commands/check.ts:647-665`) iterates its roots **sequentially**, and inside that loop it BOTH feeds the collector AND can throw:

- Each root's `expandRoot(...)` → `walkFiles(absRoot, warnings, isDocName)` (`src/commands/check.ts:657`, def at `:735`, walk at `:753`) routes skipped-symlink / unreadable-subdir advisories into the collector.
- A LATER root's `expandRoot` can throw `not_found`/`denied` (`statSync` → `ioError`, `src/commands/check.ts:739-746`) or `usage` ("not a directory", `:748`); `readSource` (`src/commands/check.ts:660`) can throw too.

So when an EARLIER root has already fed advisories into the collector and a LATER root then throws, the throw exits `collectBundles` **before** the single flush at `:161` ever runs — the earlier root's advisories are lost silently. The error itself still surfaces with its normal exit code (a missing later root is a `not_found` LoreError → exit 3, a permission failure `denied` → exit 4, a non-directory `usage` → exit 2; `EXIT_CODES` at `src/errors.ts:48-52`), routed through the CLI's one error seam — this is NOT the exit-1-uncaught path of LORE-191's plain gray-matter `Error`; only the advisory is dropped. This is the exact advisory-loss class LORE-191 closed for the scan/reconcile phases, but one grain earlier: inside discovery itself. (The same loss also occurs within a *single* root when `readSource` at `:660` throws for a file discovered after `walkFiles` already emitted a symlink advisory for that root.)

## Why it matters

Advisories are the only signal that discovery silently skipped part of a bundle. Dropping them lets a `check` run quietly under-scan an earlier root while failing loud on an unrelated later root — the user never learns the earlier root was incompletely walked. Low severity: it only fires when a real discovery advisory coincides with a later-root (or late-file) I/O throw in the same invocation.

## Fix shape (intent only — worker plans the implementation)

Guarantee the single flush runs even when `collectBundles` throws, WITHOUT introducing a second flush site. The `src/commands/check.ts:150-160` comment stresses this must remain the ONLY flush site because `WarningCollector.flush` is non-draining (a second flush would re-emit every already-flushed line). Two candidate shapes, worker to choose: (a) wrap the `collectBundles` call + the `advisories.flush(...)` in `runCheck` in `try { … } finally { advisories.flush(...) }` so the one flush runs on both the return and throw paths; or (b) flush per-root inside `collectBundles`'s loop. Shape (a) is the more surgical — it preserves the current one-collector/one-flush design and just moves the flush into a `finally`. Do not add a re-emitting second flush.

## Provenance

Wave-16 integration-review follow-up of **LORE-191** (Done). LORE-191 strictly shrank the loss window — it relocated the flush ahead of `checkBundles` + reconciliation — but explicitly did NOT close this inner multi-root discovery case; the review logged it as out-of-scope for LORE-191. This is NOT one of doc-2's original Codex second-opinion findings — it is a campaign integration-review follow-up (hence labels `cmd-check`, `codex-review-followup`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Advisories collected from an EARLIER bundle root survive a throw raised while processing a LATER root inside collectBundles (surfaced to the user on stderr, not silently dropped); the original throw still propagates through the router's one error seam with its unchanged exit code (e.g. exit 3 for a not_found bundle root).
- [x] #2 A regression test in test/check.test.ts simulates a multi-root scan where an earlier root produces a discovery advisory (e.g. a skipped symlink) and a later root throws (e.g. a nonexistent bundle root -> not_found), asserting runCheck still throws that error AND the earlier root's advisory is present on stderr.
- [x] #3 Existing single-root behavior is unchanged: the advisory collector is still flushed exactly once (no double-flush / no re-emitted lines, since WarningCollector.flush is non-draining), and the LORE-191 single-root scan-phase-throw regression plus the clean-bundle no-advisory-noise tests still pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Wrap the collectBundles(...) call + the single advisories.flush(...) in runCheck (src/commands/check.ts) in try { ... } finally { advisories.flush(...) } (shape (a) from the task). This keeps the flush the ONLY flush site (no second/re-emitting flush) while guaranteeing it runs on both the normal return path and any throw path out of collectBundles (a later root's not_found/denied/usage failure, or a late readSource throw), so an earlier root's already-collected advisories are never silently dropped when a later root fails. Add a regression test in test/check.test.ts: two roots, an earlier real root with a symlinked file (produces a skipped-symlink advisory) and a later nonexistent root (not_found), asserting runCheck still throws that LoreError (type not_found, unchanged exit code 3) AND the earlier root's advisory is present on stderr exactly once. Re-run the existing LORE-191 scan-phase-throw test and the clean-bundle no-advisory-noise test to confirm single-root behavior (flush exactly once) is unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented shape (a): in runCheck, collectBundles(...) is now called inside try { bundles = collectBundles(...) } finally { advisories.flush(...) }, so the single, non-draining flush runs on both the return path and any throw path out of collectBundles. No second flush site was added. Verified with: full 'bun test' = 1960 pass / 0 fail (bun test v1.2.23); 'bun run typecheck' clean (tsc --noEmit, no output); 'bunx biome check src/commands/check.ts test/check.test.ts' = Checked 2 files, no fixes applied (no new lint issues on the changed files). Targeted evidence: new test 'discovery advisories from an earlier root survive a later root's throw inside collectBundles (LORE-197 regression)' passes — asserts the thrown LoreError has type 'not_found' (unchanged exit code 3) and the earlier root's symlink advisory appears on stderr exactly once. Re-ran in isolation and confirmed still green: 'discovery advisories survive a scan-phase throw in checkBundles (LORE-191 regression)', 'a frontmatter-free doc produces no advisory noise (LORE-27 regression)', and 'skips a symlinked file with an advisory (does not follow it), emitted exactly once' (single-root flush-exactly-once guard).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the discovery-advisory loss window inside collectBundles: in runCheck (src/commands/check.ts), the collectBundles(...) call and its single advisories.flush(...) are now wrapped in try { ... } finally { advisories.flush(...) }, so the one non-draining flush runs whether collectBundles returns normally OR throws (a later bundle root's not_found/denied/usage failure, or a late readSource throw). An earlier root's already-collected advisories (e.g. a skipped symlink) can no longer be silently dropped by a later root's throw, and the throw still propagates unchanged through the router's one error seam with its original exit code. No second flush site was introduced. Added a regression test in test/check.test.ts covering a two-root scan where the earlier root produces a symlink advisory and the later (nonexistent) root throws not_found, asserting both the LoreError (type + message) and the surviving, exactly-once advisory line on stderr. Verified: full 'bun test' = 1960 pass / 0 fail; 'bun run typecheck' clean; 'bunx biome check' clean on both changed files; the pre-existing LORE-191 scan-phase-throw regression, the clean-bundle no-advisory-noise test, and the single-root emitted-exactly-once test all still pass, confirming single-root behavior (exactly one flush) is unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
