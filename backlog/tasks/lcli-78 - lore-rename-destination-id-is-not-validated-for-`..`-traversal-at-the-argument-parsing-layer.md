---
id: LCLI-78
title: >-
  lore rename destination id is not validated for `..` traversal at the
  argument-parsing layer
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
assertNotReservedStem and the rest of the id-parsing pipeline in args.ts validate only reserved basenames, never rejecting `..` segments in the destination id. This is the first of three layers (args parsing, the rename command, and the shared rewriteInbound engine) where the same rename-destination-traversal gap was independently found in this review; see also the rename.ts and rewrite.ts findings from the same review for the other two layers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The destination id argument is validated to reject `..` path segments before it reaches command execution, with a clear usage error
- [x] #2 A test covers a destination id containing `..` and asserts it is rejected at argument-parsing time
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Live-CLI-verify (done): `lore rename reference/orders foo/../../pwned` already fails today with
   usage/exit 2, via LCLI-79's assertDestinationConfined call in runRename (right after
   parseRenameArgs returns). AC#1 (reject before command execution, clear usage error) is already
   substantively satisfied.
2. AC#2 asks specifically for rejection "at argument-parsing time" and names the layer as
   "args.ts / parseRenameArgs". Today the check runs in runRename's body immediately after
   parseRenameArgs returns, not inside parseRenameArgs itself. Relocate the
   assertDestinationConfined(newId) call into parseRenameArgs (right after the newId positional is
   extracted, before it returns), so newId confinement is an intrinsic part of what parsing
   guarantees, not a caller-side follow-up check. Remove the now-redundant separate call in
   runRename.
3. Update the surrounding comments (module docstring lines ~28-33, assertDestinationConfined's own
   docstring) to reflect the new call site and credit LCLI-78 alongside LCLI-79/80 as the third
   (now-realized) layer.
4. Add one new test in test/rename.test.ts's "errors and arg parsing" describe block, labeled
   LCLI-78, asserting a `..`-containing newId is rejected as usage — giving LCLI-78 its own
   AC-to-test traceability distinct from LCLI-79's existing coverage (no exported parse function
   precedent exists anywhere in this codebase, so this stays a CLI-level integration test like every
   other parseXArgs in the project).
5. Run bun test, typecheck, lint. Re-run the live-CLI repro once more post-change to confirm
   behavior unchanged (still usage/exit 2, real repo untouched).
6. Check ACs with evidence, write final summary, move to Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Live-CLI-verified pre-fix (per campaign convention): `lore rename reference/orders foo/../../pwned`
already failed with usage/exit 2 today, via LCLI-79's assertDestinationConfined call in runRename's
body (right after parseRenameArgs returns) — AC#1 was already substantively satisfied before this
task's own change. LCLI-78's genuine remaining value is AC#2's literal ask: the check named at the
"args.ts / parseRenameArgs" layer specifically, not the command-body layer LCLI-79 used.

Relocated assertDestinationConfined(newId) into parseRenameArgs itself (right after the newId
positional is extracted, before returning), removing the now-redundant separate call from
runRename. A confined newId is now parseRenameArgs's own guarantee, not a caller-side follow-up
check — literally satisfying "at argument-parsing time." Updated the module docstring and
assertDestinationConfined's own docstring to credit LCLI-78 alongside LCLI-79/LCLI-80.

Added one new test (test/rename.test.ts, "errors and arg parsing") explicitly labeled LCLI-78: a
`..`-segment newId is rejected as usage even when oldId is never written (no bundle-relative work
possible) — proving the check requires nothing but the raw argument tokens. No parseXArgs function
is exported anywhere in this codebase for direct unit testing (checked all 15+ commands) — this
stays a CLI-level integration test like every other parse-layer test in the project, consistent
with the established convention.

Post-change live-CLI re-verification (fresh scratch bundle): traversal newId, absolute newId, and
a nonexistent-oldId+traversal-newId combination all still fail with usage/exit 2; real repo git
status clean apart from pre-existing .repro-scratch/ and docs/.obsidian/.

Full verification: bun test 1656/1656 pass (up from 1655); bun run typecheck clean; bun run lint 4
pre-existing infos in managed-block.ts/managed-block.test.ts/supersede.test.ts only (none in the
changed files).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Relocated the newId bundle-confinement check (assertDestinationConfined, reusing rewrite.ts's
exported escapesRoot) from runRename's body into parseRenameArgs itself, so a confined destination
id is parseRenameArgs's own guarantee — literally satisfying AC#1/#2's "argument-parsing layer"
framing, not just a caller-side follow-up check (which is what LCLI-79 had already shipped).
Live-CLI-verified both pre- and post-change: a `..`-segment or absolute newId is rejected with
usage/exit 2 before any bundle load, oldId resolution, or write, including when oldId is entirely
absent. Added one new LCLI-78-labeled test (test/rename.test.ts) proving the check needs nothing
but the raw argument tokens. Verified: bun test 1656/1656 pass; bun run typecheck clean; bun run
lint 4 pre-existing infos, all in unrelated files.
<!-- SECTION:FINAL_SUMMARY:END -->
