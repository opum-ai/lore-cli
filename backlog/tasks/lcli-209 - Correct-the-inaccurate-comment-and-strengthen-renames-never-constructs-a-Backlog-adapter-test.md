---
id: LCLI-209
title: >-
  Correct the inaccurate comment and strengthen rename's "never constructs a
  Backlog adapter" test
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - cmd-rename-supersede
  - codex-review-followup
  - test-quality
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: chore
ordinal: 311000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The test "renaming an unlinked concept never constructs a Backlog adapter at all" at `test/rename.test.ts:1107-1126` carries a comment (lines 1111-1113) that justifies its claim with a false mechanism: it says constructing the real default adapter "would either hang or throw in a sandboxed test run." That is not true. `defaultAdapter(root)` (`src/commands/link.ts:530`) returns `createBacklogAdapter(bunBacklogSpawn(undefined, root))`; `createBacklogAdapter` (`src/adapters/backlog.ts:690`) only allocates closures, and `bunBacklogSpawn` (`src/adapters/backlog.ts:235`) only returns an async function — `Bun.spawn` runs at `src/adapters/backlog.ts:237` exclusively when a method (`probe`/`listTasks`/etc.) is invoked. Construction is therefore inert; it neither hangs nor throws.

Consequence: the test's assertion (an unlinked rename succeeds with empty `backRefs`) proves only that no Backlog method is *invoked* (no subprocess spawned) — it does NOT prove the adapter is never *constructed*, and its stated reasoning is wrong. In production the default adapter is in fact only constructed inside the linked/non-dry-run branch (`src/commands/rename.ts:206-207`), so the title's claim is true of the code, but the test does not actually enforce it.

Provenance: Codex second-opinion review (backlog doc-2), Low-severity cluster `cmd-rename-supersede`. Low live impact — a test-hygiene/accuracy issue, no production bug.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The comment at test/rename.test.ts:1107-1126 no longer claims that merely constructing the default Backlog adapter would "hang or throw"; it accurately states that construction (defaultAdapter -> createBacklogAdapter(bunBacklogSpawn(...))) is lazy and that an unlinked rename never reaches the Backlog branch (src/commands/rename.ts:206-207), so no subprocess is spawned.
- [x] #2 The test enforces its title rather than merely asserting it in prose: it fails if src/commands/rename.ts were changed to construct or invoke the default Backlog adapter during an unlinked rename — e.g. via a spy on defaultAdapter/bunBacklogSpawn asserting zero calls, or an injected spawn/adapter seam that throws if touched, so an accidental unconditional construction/invocation is caught.
- [x] #3 `bun test test/rename.test.ts` passes with the updated test.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite the inaccurate comment (test/rename.test.ts:1111-1113) to state construction is lazy (defaultAdapter -> createBacklogAdapter(bunBacklogSpawn) only allocate closures; Bun.spawn runs only on method invocation) and that an unlinked rename never reaches the Backlog branch (src/commands/rename.ts:206-207).
2. Strengthen the test to ENFORCE its title: add 'import * as linkModule from "../src/commands/link"' and spyOn(linkModule, "defaultAdapter"), asserting toHaveBeenCalledTimes(0) after an unlinked rename — test-side spy only, no src change.
3. Verify: probe that spyOn on the namespace import actually intercepts rename.ts's internal named-import call (it does, confirmed empirically); temporarily reintroduce an unconditional defaultAdapter call in rename.ts and confirm the strengthened test fails, then revert (confirmed, reverted, git diff clean on src).
4. Run bun test test/rename.test.ts, full bun test, and bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: rewrote the inaccurate comment and added a spyOn(linkModule, "defaultAdapter") assertion (toHaveBeenCalledTimes(0)) to the 'never constructs a Backlog adapter' test in test/rename.test.ts. Test-side only (no src change) via a namespace import of ../src/commands/link.

Verification:
- bun test test/rename.test.ts: 105 pass, 0 fail (was already 104; +1 assertion, same test count since it's the same test strengthened, not a new one -- 105 total in file).
- Full bun test: 1913 pass, 0 fail across 47 files.
- bun run typecheck: clean (tsc --noEmit, no output/errors).
- bunx biome check test/rename.test.ts: no issues.
- Falsification demonstrated directly: temporarily added an unconditional 'options.adapter ?? defaultAdapter(options.root)' call in src/commands/rename.ts (right after oldConcept is resolved, before the linkedTasks-gated branch) to simulate the exact regression AC#2 describes. Re-ran the strengthened test alone (bun test test/rename.test.ts -t "never constructs a Backlog adapter") -- it FAILED with 'Expected number of calls: 0, Received number of calls: 1' at the new expect(defaultAdapterSpy).toHaveBeenCalledTimes(0) line, while every pre-existing assertion in the test still passed. Reverted the src edit immediately after; git diff confirms src/commands/rename.ts is byte-identical to base (only test/rename.test.ts changed).
- Also empirically confirmed (scratch probe, not committed) that spyOn on a namespace import of a same-repo module correctly intercepts a named-import call made internally by another module in the same Bun test run -- this is the same mechanism the strengthened test now relies on.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected the inaccurate 'would hang or throw' comment on the rename 'never constructs a Backlog adapter' test (test/rename.test.ts) with the accurate lazy-construction/branch-skip explanation, and strengthened the test to actually enforce its title via spyOn(linkModule, "defaultAdapter") asserting zero calls on an unlinked rename -- a test-side-only change (namespace import of ../src/commands/link, no src edit). Verified: bun test test/rename.test.ts (105 pass/0 fail), full bun test (1913 pass/0 fail across 47 files), bun run typecheck (clean), and a direct falsification demonstration -- temporarily reintroducing an unconditional defaultAdapter call in src/commands/rename.ts made the new assertion fail as expected, then reverted (src/commands/rename.ts unchanged in the final diff).
<!-- SECTION:FINAL_SUMMARY:END -->
