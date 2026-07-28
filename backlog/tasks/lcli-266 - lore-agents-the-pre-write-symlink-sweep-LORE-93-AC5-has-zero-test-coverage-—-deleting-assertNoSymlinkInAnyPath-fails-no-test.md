---
id: LCLI-266
title: >-
  lore agents: the pre-write symlink sweep (LORE-93 AC#5) has zero test coverage
  — deleting assertNoSymlinkInAnyPath fails no test
status: Done
assignee:
  - '@lore-e2e'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - security
  - test-coverage
  - cmd-crud-a
dependencies: []
priority: low
type: bug
ordinal: 370000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
The `assertNoSymlinkInAnyPath` sweep in the agent-bridge write path should be pinned by a regression test, so the LCLI-93 AC#5 invariant (refuse the whole run if ANY target path is a symlink, BEFORE the first write) cannot be silently removed.

## Observed
Found during the LCLI-260 review by mutation testing. Deleting the `assertNoSymlinkInAnyPath(root, targets)` call from the agent-bridge write path produces **0 test failures** — on `dev` as well as on the LCLI-260 branch. It is therefore pre-existing, NOT introduced by LCLI-260.

A live symlink test still exits 5 today, but only because `ensureDir`'s own per-call guard catches it **reactively**, one path at a time. That is a different, weaker property than the one LCLI-93 AC#5 established: sweep every target up front and refuse before writing anything. With the sweep gone, a run with a symlink on the *second* target would write the *first* file before failing — a partial application the sweep exists to prevent.

## Why it matters
This queue is itself the follow-up backlog of a security/robustness review, and symlink escape is one of its recurring classes (LCLI-76, LCLI-77, LCLI-79, LCLI-91, LCLI-93, LCLI-94). An untested security guard is one refactor away from silently disappearing — and the LCLI-260 fold-in refactored exactly this code path, which is how the gap surfaced.

## Direction (decide in plan)
Add a regression test that plants a symlink at the SECOND bridge target and asserts (a) the run refuses with exit 5, and (b) the FIRST target was never written — the second assertion is what distinguishes the up-front sweep from `ensureDir`'s reactive guard. Consider whether the same gap exists for other multi-target sweeps.

## Refs
src/commands/agents.ts / src/core/agent-bridge.ts (`assertNoSymlinkInAnyPath`), test/agents.test.ts, LCLI-93 (Done — established the invariant), LCLI-76/LCLI-263 (symlink guard must never be bypassed by an idempotent skip).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A regression test plants a symlink at a NON-FIRST agent-bridge target and asserts the run refuses with exit 5 AND that no earlier target file was written — distinguishing the up-front sweep from ensureDir's reactive per-call guard.
- [x] #2 Deleting or neutering assertNoSymlinkInAnyPath causes that test to fail (verified by an explicit mutation check recorded in the task notes).
- [x] #3 Any other multi-target pre-write sweep with the same gap is identified and either covered or explicitly noted as out of scope.
- [x] #4 Full suite + lore check stay green; no behavior change.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm plan.files ordering in core/agent-bridge.ts: planBridge = [planSkill, planNudge] -> SKILL.md is always the FIRST target, CLAUDE.md the SECOND, in commands/agents.ts's applyAgentsBridge.
2. Add a new regression test in test/agents.test.ts: fresh repo (both files planned "created"), symlink planted at CLAUDE.md (the second/non-first target, since CLAUDE_MD_REL_PATH has no ancestor dir of its own to symlink, but assertNoSymlinkInPath also checks the FINAL path segment). Assert: (a) runAgents throws a LoreError type "conflict" (exit 5), (b) SKILL.md (the FIRST target) was never written to disk, (c) the CLAUDE.md symlink itself is untouched.
3. Mutation check (AC#2): neuter the assertNoSymlinkInAnyPath call in commands/agents.ts, re-run test/agents.test.ts, record the real failure output, then restore and re-verify green.
4. AC#3 sweep: grep all callers of assertNoSymlinkInAnyPath (commands/rename.ts, commands/sync.ts, commands/agents.ts). rename.ts already has a discriminating AC#5 test (test/rename.test.ts:1096, "a symlinked destination refuses BEFORE a legitimate inbound rewrite is written") -> already covered, no new test needed. sync.ts has ZERO symlink tests in test/sync.test.ts -> genuine gap, worse than agents.ts's pre-existing one (no coverage at all vs. non-discriminating coverage). Add an analogous discriminating regression test there (first target: a real concept doc status rewrite; second target: a symlinked docs/index.md), plus its own mutation check.
5. Full suite (`bun test`) + `bun run lore check` must stay green; no production behavior change (agents.ts's assertNoSymlinkInAnyPath call site is untouched, only restored after the mutation check).
6. CHANGELOG: assess against precedent (test-only PRs) before deciding to add an entry.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#1 test added: test/agents.test.ts, new describe block "lore agents — the up-front sweep, not ensureDir's reactive guard, catches a NON-FIRST target (LCLI-266)". core/agent-bridge.ts's planBridge always orders plan.files as [SKILL.md, CLAUDE.md]. Fresh repo -> both plan "created" (non-null contents), so both are swept targets. Symlink planted at CLAUDE.md (the SECOND target, a dangling symlink — readFileIfPresent gracefully treats it as absent so it still plans "created"). runAgents throws LoreError type "conflict" (maps to exit 5 per EXIT_CODES.conflict), and SKILL.md (the FIRST target) is proven never written via existsSync(skillAbs())===false. Also asserts the CLAUDE.md symlink itself is untouched (lstatSync still isSymbolicLink()).

AC#2 mutation check (objective evidence, actually executed): commented out the `assertNoSymlinkInAnyPath(root, targets)` call in src/commands/agents.ts (replaced with `void targets;`), ran `bun test test/agents.test.ts`. Real observed output: "32 pass / 1 fail" — the new test failed with `expect(thrown).toBeInstanceOf(LoreError)` receiving `undefined` (runAgents returned instead of throwing — the mutated run silently SUCCEEDED, replacing the symlink, exactly the partial/silent-bypass hazard AC#5 exists to prevent). Restored the real call, re-ran `bun test test/agents.test.ts`: 33 pass / 0 fail. git diff on src/commands/agents.ts is empty after restore (verified via `git diff --stat`).

AC#3 sweep: grepped every call site of assertNoSymlinkInAnyPath: src/commands/agents.ts (this task), src/commands/rename.ts:328 (commitWrites), src/commands/sync.ts:207. Findings:
- sync.ts: test/sync.test.ts had ZERO symlink tests at all (grep for symlinkSync returned nothing) — a genuine gap, worse than agents.ts's. Added a discriminating test: "lore sync — the up-front symlink sweep, not ensureDir's reactive guard, catches a NON-FIRST target". `writes` (sync.ts) is filled per-concept first, then regenerateIndexAndLog appends index.md/log.md — so a real concept status-rewrite always precedes the root index.md in insertion order. Symlinked docs/index.md (dangling symlink) is therefore the NON-FIRST target. Verified via the SAME mutation-check method: commenting out the sweep call in sync.ts made `expectSyncError` fail with "expected a LoreError, but runSync returned" (the run silently succeeded instead of refusing); restored, re-ran: 31 pass / 0 fail, empty diff on sync.ts.
- rename.ts: an existing test at test/rename.test.ts (~line 1096) CLAIMED ("AC#5" in its own title/comment) to already discriminate the sweep from ensureDir's reactive guard, using a symlinked "docs/evil" destination directory alongside a legitimate bulk.md inbound-link rewrite. Actually EXECUTED the mutation check on it (commented out rename.ts's assertNoSymlinkInAnyPath call) and found the test STILL PASSED UNCHANGED (115/115) — i.e. it was NOT actually discriminating, exactly the "written not tested" trap this campaign warns about. Root cause (confirmed via a debug repro script, since removed): `writes`' Map insertion order is the bundle's sorted path order, and renaming into a NEW category directory ("evil") also creates a synthetic "evil/index.md" write for that category's own index hub — "evil" sorts BEFORE "stories", so that synthetic entry (itself under the symlinked directory) was always the very FIRST entry the write loop reached, so ensureDir's own reactive per-call guard threw on the first iteration regardless of whether the sweep ran. Fixed by changing the destination category from "evil" to "zzz-evil" (sorts AFTER "stories/bulk.md"), which genuinely reorders the write set so bulk.md's own legitimate rewrite is reached first. Re-verified both directions: with the real sweep, exit conflict + bulk.md untouched (still old link); with the sweep neutered (mutation), bulk.md's write DOES land (content changed to the new link) before the later reactive-guard throw — 114 pass/1 fail, confirming the fix genuinely discriminates. Restored the real call; 115 pass/0 fail, empty diff on rename.ts. The unrelated first LCLI-93 regression test in the same describe block (using "evil", tied to the original bug report's literal repro) was left untouched.

Full verification: `bun test` -> 2183 pass / 0 fail (49 files). `bun run lore check` -> 40 files, 0 errors, 0 warnings. `bun run typecheck` -> clean (tsc --noEmit, no output). `bun run lint` -> clean after `bun run lint:fix` reformatted the two new multi-line node:fs imports (test/agents.test.ts, test/sync.test.ts) to satisfy biome's line-length rule; re-ran full suite after formatting: still 2183 pass / 0 fail.

CHANGELOG: deliberately omitted. Precedent checked: LCLI-211/212/213/214 (identical shape — labeled test-coverage, regression tests added for existing guards, explicit mutation-kill verification, no production behavior change) all merged (see commits 041d487, f5c85c8, b81b1cf, b1821f4) touching only their backlog task file + the relevant test file, with no CHANGELOG.md entry. LCLI-266 matches that shape exactly (AC#4: no behavior change) and src/commands/{agents,rename,sync}.ts have an empty diff — no production code was changed, only tests.

Final diff: only test/agents.test.ts, test/rename.test.ts, test/sync.test.ts, and this task's own backlog file were modified. No production source files changed.

Review-gate fix (post-merge-gate request_changes, addressed on this same branch before merge): the reviewer flagged that the LCLI-93 regression test's comment (test/agents.test.ts:159-172, pre-existing, untouched by this branch's original diff) asserted two claims disproven by this branch's own new coverage — "there is no black-box way to make agents.ts exercise the sweep's ordering property specifically" and "the only reachable vulnerable target is SKILL.md, which is always first." Both are false: the LCLI-266 describe block 40 lines below (added by this task) does exactly that, by symlinking CLAUDE.md (the SECOND target) rather than an ancestor directory, and proves that without the sweep, SKILL.md gets written and the CLAUDE.md symlink is destroyed (replaced by writeFileAtomic's renameSync commit, not "followed"). The same comment also credited test/rename.test.ts's AC#5 test as already proving the sweep's ordering property, when per this task's own implementation notes above, that test was non-discriminating (115/115 under mutation) until this branch's "evil" -> "zzz-evil" fixture reorder made it genuinely discriminate.

Fix applied: rewrote the comment block at test/agents.test.ts:159-172 to (a) keep the still-true part (this specific LCLI-93 test does not discriminate the sweep from ensureDir's reactive guard, since SKILL.md is symlinked here and sorts first), (b) drop the "no black-box way" / "only reachable target" claims and point forward to the LCLI-266 describe block that does exercise the ordering property, and (c) correct the rename.test.ts credit to note that test only discriminates as of this branch's own fixture fix.

Consistency sweep performed (not just the flagged lines): grepped test/agents.test.ts, test/rename.test.ts, test/sync.test.ts, src/commands/fswrite.ts (assertNoSymlinkInAnyPath docstring + ensureDir docstring), src/commands/agents.ts, src/commands/rename.ts, src/commands/sync.ts for "no black-box way", "SKILL.md, which is always first", "only reachable vulnerable target", "always first", and "actually proves the sweep"/"discriminat*". Only the one flagged comment block in test/agents.test.ts contained the false claims; the analogous comments in test/rename.test.ts (~line 1096-1116, already fixed by this branch) and test/sync.test.ts (~line 191-224) and the source docstrings (fswrite.ts assertNoSymlinkInAnyPath/ensureDir, agents.ts/rename.ts/sync.ts call-site comments) were all already accurate and needed no change.

Re-verified after the comment rewrite: bun test -> 2183 pass / 0 fail across 49 files (unchanged from baseline). bun run lore check -> 40 files, 0 errors, 0 warnings. bun run typecheck -> clean. bun run lint -> "Checked 112 files in 114ms. No fixes applied." git diff dev...HEAD --stat shows zero src/ changes; the only uncommitted change was the comment-only edit to test/agents.test.ts (no executable line touched).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a regression test in test/agents.test.ts that plants a symlink at CLAUDE.md (the SECOND agent-bridge target, since planBridge always orders SKILL.md first) and proves both the exit-5 refusal and that SKILL.md (the FIRST target) was never written -- the property distinct from ensureDir's reactive per-call guard. Verified via an executed mutation check: neutering assertNoSymlinkInAnyPath in src/commands/agents.ts made the new test fail (32 pass/1 fail: runAgents silently succeeded instead of throwing); restored, re-verified green (33 pass/0 fail), empty diff.

AC#3 sweep of the other two assertNoSymlinkInAnyPath call sites: sync.ts had zero symlink test coverage at all -- added an analogous discriminating test (symlinked docs/index.md as the non-first target after a real concept status-rewrite), same executed mutation-check discipline (31 pass/0 fail restored; failed as expected when neutered). rename.ts's existing "AC#5" test claimed to discriminate the sweep but, when actually mutation-tested, did not (115/115 unchanged with the sweep removed) -- its symlinked "evil" destination category sorted before the legitimate rewrite it was meant to protect. Fixed by renaming the destination to "zzz-evil" (sorts after the protected write), re-verified both directions (115/115 real; 114/1 mutated, confirming genuine discrimination).

Verification actually run: bun test test/agents.test.ts (33/0), bun test test/sync.test.ts (31/0), bun test test/rename.test.ts (115/0), full bun test (2183 pass/0 fail, 49 files), bun run lore check (40 files, 0 errors/0 warnings), bun run typecheck (clean), bun run lint (clean after lint:fix reformatted two new imports). Every mutation check above was executed and its real pass/fail counts recorded in the implementation notes; no production source file (agents.ts/rename.ts/sync.ts) has any net diff. No behavior change (AC#4); CHANGELOG entry deliberately omitted per the LCLI-211/212/213/214 test-coverage-only precedent (no CHANGELOG touch in any of those merged commits).
<!-- SECTION:FINAL_SUMMARY:END -->
