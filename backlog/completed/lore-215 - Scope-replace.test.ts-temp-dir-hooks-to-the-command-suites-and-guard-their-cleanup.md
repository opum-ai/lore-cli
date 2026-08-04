---
id: LORE-215
title: >-
  Scope replace.test.ts temp-dir hooks to the command suites and guard their
  cleanup
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 17:11'
labels:
  - core-replace
  - codex-review-followup
  - test-hygiene
dependencies: []
priority: low
type: task
ordinal: 317000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Provenance:** Codex second-opinion review (backlog doc-2), low-severity, cluster `core-replace`.

**Outcome:** The `root` temp-directory lifecycle in `test/replace.test.ts` should apply only to the suites that actually use a filesystem, and its cleanup should not throw a masking secondary error when setup failed.

**Why:** The file-level hooks at `test/replace.test.ts:396-404` (`let root: string;` + a `beforeEach` doing `mkdtempSync`/`mkdirSync` + an `afterEach` doing `rmSync(root, …)`) apply to every test in the file. Confirmed empirically that Bun runs a file-level `beforeEach` for tests declared *earlier* in the file too, so all the pure-engine suites — `replaceInText — literal mode`, `replaceInText — regex mode …`, `replaceInText — managed regions …`, `managedRanges`, `MANAGED_REGION_LOCATORS …`, `mergeRanges` (lines 55-392) — each perform an unnecessary temp-dir create+remove even though they touch no filesystem. Separately, `root` is uninitialized (`let root: string;`), so if `mkdtempSync` throws in `beforeEach`, the `afterEach` still fires and calls `rmSync(undefined, …)`, throwing a confusing TypeError that masks the real setup failure.

**Live context:** hooks and `root` at `test/replace.test.ts:396-404`; the helpers that depend on `root` (`writeDoc` 407-411, `replaceCmd` 414-420, `expectError` 423-431) and the command-level describes that use it are `lore replace — whole-bundle default` (433), `… scoping, dedup, and safety` (480), `… commit-phase write atomicity` (543), `… rendering and arg parsing` (593), `… usage errors` (629), and `… router integration` (662). The `writeFileOverwriting`/`writeFileAtomic`/`writeAllBytes`/`writeFileNoFollow` suites (687+) do NOT use `root` — they manage their own `dir`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The pure-engine suites in test/replace.test.ts (`replaceInText — *`, `managedRanges`, `MANAGED_REGION_LOCATORS — *`, `mergeRanges`) no longer run the `root` mkdtempSync/mkdirSync/rmSync hooks — those tests perform no temp-directory creation or removal.
- [x] #2 The `root` temp-directory beforeEach/afterEach apply only to the command-level suites that actually use `root` (the `lore replace — *` describes and the router-integration describe); the fswrite suites, which manage their own `dir`, are not given a redundant `root`.
- [x] #3 The temp-directory cleanup no longer throws a secondary error when setup did not assign `root` (e.g. it is skipped when `root` is unset), so a `beforeEach`/mkdtempSync failure surfaces as the original error rather than a masking `rmSync(undefined, …)` TypeError.
- [x] #4 `bun test test/replace.test.ts` passes with all tests green (85 tests at time of filing).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Wrap the six command-level describes ('lore replace — whole-bundle default', '... scoping, dedup, and safety', '... commit-phase write atomicity (LORE-116)', '... rendering and arg parsing', '... usage errors', '... router integration') plus the root beforeEach/afterEach and the writeDoc/replaceCmd/expectError helpers inside one new wrapping describe('lore replace — command-level suites (root fixture)'), so the pure-engine suites (lines 55-392) and the fswrite suites (687+, own dir fixture) sit at top level and never run the root hooks. 2. Change 'let root: string;' to 'let root = "";' and guard afterEach with 'if (root) rmSync(root, ...)' so a beforeEach failure (mkdtempSync throwing before root is assigned) surfaces the original error instead of a masking rmSync(undefined) TypeError. 3. Verify: bun test test/replace.test.ts (85 green), full bun test, bun run typecheck, bunx biome check test/replace.test.ts, plus a temporary mutation (throw before mkdtempSync in beforeEach) to prove the original error propagates and only the 25 root-fixture tests fail while pure-engine/fswrite tests stay green — then revert the mutation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wrapped the six command-level describes (whole-bundle default, scoping/dedup/safety, commit-phase atomicity, rendering/arg parsing, usage errors, router integration) plus the root beforeEach/afterEach and writeDoc/replaceCmd/expectError helpers inside a new describe('lore replace — command-level suites (root fixture)'). Pure-engine describes (replaceInText/managedRanges/MANAGED_REGION_LOCATORS/mergeRanges, lines 55-392) and the fswrite describes (writeFileOverwriting/writeFileAtomic/writeAllBytes/writeFileNoFollow, 691+) now sit at top level, confirmed via 'grep -n "^describe(\|^  describe("' showing the pure-engine/fswrite describes at column 0 and only the six command-level ones indented under the new wrapper. Changed 'let root: string;' to 'let root = "";' and guarded afterEach with 'if (root) { rmSync(...) }'. Verification: bun test test/replace.test.ts -> 85 pass/0 fail (matches AC#4's filing-time count); full bun test -> 1917 pass/0 fail; bun run typecheck -> clean; bunx biome check test/replace.test.ts -> no issues. Mutation-killer proof for AC#3: temporarily inserted 'throw new Error("SIMULATED_SETUP_FAILURE_LORE215")' as the first line of beforeEach (before mkdtempSync assigns root) and reran bun test test/replace.test.ts: exactly the 25 root-fixture tests failed, each with the ORIGINAL SIMULATED_SETUP_FAILURE_LORE215 error (not a masking rmSync(undefined) TypeError), while the 60 pure-engine+fswrite tests stayed green -- then reverted the mutation (diff against pre-mutation backup confirmed clean, git diff --stat unchanged).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scoped the temp-dir 'root' lifecycle in test/replace.test.ts to only the six command-level describes ('lore replace — whole-bundle default / scoping, dedup, and safety / commit-phase write atomicity (LORE-116) / rendering and arg parsing / usage errors / router integration') by nesting them, along with the root beforeEach/afterEach and the writeDoc/replaceCmd/expectError helpers, inside a new wrapping describe('lore replace — command-level suites (root fixture)'). The pure-engine suites (replaceInText, managedRanges, MANAGED_REGION_LOCATORS, mergeRanges) and the fswrite suites (writeFileOverwriting, writeFileAtomic, writeAllBytes, writeFileNoFollow — which manage their own 'dir') now sit outside that wrapper and no longer run the root hooks. Changed 'let root: string;' to 'let root = "";' and guarded the afterEach with 'if (root) { rmSync(root, ...) }' so a beforeEach setup failure (mkdtempSync throwing before root is assigned) surfaces the original error rather than a masking rmSync(undefined) TypeError. Verified: bun test test/replace.test.ts -> 85 pass/0 fail; full bun test -> 1917 pass/0 fail; bun run typecheck -> clean; bunx biome check test/replace.test.ts -> clean. Proved AC#3 with a temporary mutation (forced beforeEach to throw before mkdtempSync) showing the original error propagates for all 25 root-fixture tests with no masking TypeError while the 60 pure-engine/fswrite tests stayed green; the mutation was fully reverted (verified via diff against a pre-mutation backup) before committing.
<!-- SECTION:FINAL_SUMMARY:END -->
