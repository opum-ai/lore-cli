---
id: LORE-191
title: >-
  Discovery advisories are lost when checkBundles throws in the scan phase
  (post-LORE-138)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-22 23:20'
updated_date: '2026-07-23 10:05'
labels:
  - codex-review-followup
  - cmd-check
dependencies: []
priority: low
type: bug
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
commands/check.ts flushes discovery advisories (around line 169) AFTER checkBundles(bundles) (around line 145). Before LORE-138 (wave 11) the bundle scan could not throw (bodyText swallowed every gray-matter exception). Post-LORE-138 a real input (e.g. a `---toml` frontmatter fence, proven by the new test/check.test.ts case) makes bodyText re-throw a plain Error out of the scan, so advisories collected around line 144 are lost and no report emits (exit 1 uncaught). The comment block at lines ~160-168 explicitly reasons that deferring the flush risks losing advisories entirely — the new scan-phase throw violates that stated guarantee. Fix: flush the collected discovery advisories right after collectBundles (the collectors only feed) so they survive a later scan/reconcile throw. Wave-11 integration-review finding (low).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Discovery advisories collected before checkBundles are surfaced to the user even when checkBundles throws in the scan phase
- [x] #2 A regression test proves the collected advisories survive a scan-phase throw (e.g. a non-YAML gray-matter error) rather than being silently dropped
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/commands/check.ts, relocate the advisories.flush() call to run immediately after collectBundles() (before checkBundles(bundles) is called), instead of after checkBundles/before reconciliation. collectBundles is the only source that feeds the WarningCollector, so flushing right after it means discovery advisories survive even if checkBundles throws in the scan phase (post-LORE-138, a --toml frontmatter fence makes bodyText re-throw a plain Error). Update surrounding comments to explain the new ordering and remove the stale 'scan above can no longer throw' claim. Ensure no double-flush (single flush site preserved). 2. Add a regression test in test/check.test.ts: write a docs/ bundle with a symlink (produces a discovery advisory) plus a file with a ---toml frontmatter fence (triggers a scan-phase throw), call runCheck, assert it throws the gray-matter engine error AND that stderr still contains the symlink advisory. 3. Verify with full bun test suite + tsc --noEmit + biome lint on changed files only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Relocated advisories.flush() in src/commands/check.ts to run immediately after collectBundles() (before checkBundles(bundles)), so discovery advisories are guaranteed to reach stderr even when checkBundles throws in the scan phase or reconciliation later rejects. Removed the now-stale flush call and comment that assumed the scan phase 'can no longer throw'; single flush site preserved (no double-flush). Added regression test in test/check.test.ts: 'discovery advisories survive a scan-phase throw in checkBundles (LORE-191 regression)' — writes a symlinked file (discovery advisory) plus a ---toml frontmatter fence (post-LORE-138 scan-phase throw), asserts runCheck throws the gray-matter engine error while stderr still contains the symlink advisory. Verification: full suite bun test = 1901 pass / 0 fail (206 pass in test/check.test.ts alone, including the new test); bun run typecheck (tsc --noEmit) clean; bun run lint shows no new findings in src/commands/check.ts or test/check.test.ts (pre-existing repo-wide lint baseline untouched).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the discovery-advisory loss bug: advisories.flush() in runCheck (src/commands/check.ts) now runs right after collectBundles(), before checkBundles(bundles) is invoked, so advisories collected during discovery are flushed to stderr before the scan phase runs at all -- surviving a scan-phase throw (post-LORE-138, e.g. a ---toml frontmatter fence) as well as a later reconciliation rejection. Added a regression test in test/check.test.ts proving a symlink advisory reaches stderr even though runCheck synchronously throws on the toml-fence file. Verified with the full suite: bun test = 1901 pass / 0 fail across 47 files (206 pass in test/check.test.ts); bun run typecheck clean; bun run lint introduces no new findings in the two changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
