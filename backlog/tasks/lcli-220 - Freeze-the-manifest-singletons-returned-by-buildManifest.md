---
id: LCLI-220
title: Freeze the manifest singletons returned by buildManifest()
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:29'
labels:
  - core-concept-manifest
  - codex-review-followup
  - hardening
dependencies: []
priority: low
type: enhancement
ordinal: 322000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** The manifest returned by `buildManifest()` (src/core/manifest.ts:427-434) is immutable — mutating it (or its nested command/flag entries) throws in strict mode / is a no-op — so shared state cannot be corrupted across calls in one process.

**Why:** `buildManifest()` returns the module-level `LORE_MANIFEST` (src/core/manifest.ts:144-415) and `GLOBAL_FLAGS` (L126-135) `const` arrays by reference with no `Object.freeze` and no defensive copy. The `readonly` modifiers on `Manifest`/`ManifestCommand`/`ManifestFlag` are compile-time-only, so a type-bypassing (`as any`) or plain-JS consumer could mutate the shared singleton and poison every later `buildManifest()`/`findManifestCommand()`/`manifestCommandNames()` read. This mirrors the codebase's own defensive convention — `Object.freeze` on YAML_LOAD_OPTIONS/YAML_DUMP_OPTIONS in src/core/concept.ts (L124, L138).

**Live context:** Impact is low in the run-once CLI (each invocation exits), but the shared-mutable-state hazard is real and the fix is a trivially-scoped hardening.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster core-concept-manifest; re-audit round 3 confirmed still-present against dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The object returned by buildManifest() is deeply immutable: the top-level envelope, the `commands` array, each command entry and its `flags` array/entries, and the `globalFlags` array/entries are frozen (or otherwise made non-mutable).
- [x] #2 A new test in test/help.test.ts asserts that attempting to mutate the returned manifest (e.g. `buildManifest().commands.push(...)` or reassigning a command's `kind`) throws in strict mode or has no effect, and that a subsequent buildManifest() call returns unaffected data.
- [x] #3 All existing test/help.test.ts assertions remain green (no shape/behavior change to the manifest data itself).
- [x] #4 The full test suite (`bun test`) passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a deepFreeze<T>(value) helper in src/core/manifest.ts that recursively Object.freezes arrays and plain objects (mirrors the existing Object.freeze convention on YAML_LOAD_OPTIONS/YAML_DUMP_OPTIONS in core/concept.ts).
2. Wrap the GLOBAL_FLAGS and LORE_MANIFEST module-level array literals in deepFreeze(...) so the shared singletons (and every nested command/flag entry) are frozen once at module load.
3. Wrap buildManifest()'s returned envelope object in deepFreeze(...) too, since it composes a fresh exitCodeTaxonomy() object each call — freezing the already-frozen GLOBAL_FLAGS/LORE_MANIFEST again is a harmless no-op, and the envelope itself + the fresh exitCodes object get frozen.
4. Add a new describe block in test/help.test.ts asserting: reassigning envelope/command/flag fields and pushing onto commands/flags/globalFlags arrays all throw TypeError (bun test runs ESM strict mode), that the underlying data is unaffected after each throw, and that a mutation attempt against one buildManifest() call cannot poison a subsequent buildManifest() call. Use as-cast bypasses (as unknown as {...}) to simulate the type-bypassing/plain-JS consumer the task describes, matching existing as any patterns already used elsewhere in test/*.ts.
5. Verify: bun test (full suite), bun run typecheck, bunx biome check on the two changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test full suite -> 1942 pass / 0 fail / 5498 expect() calls across 47 files (includes 7 new tests in test/help.test.ts, up from 328 to 335 total AC-relevant assertions inside help.test.ts: 35 pass there). bun run typecheck -> clean (tsc --noEmit, no errors). bunx biome check src/core/manifest.ts test/help.test.ts -> 'Checked 2 files in 20ms. No fixes applied.' (no new lint issues on changed files).

Implementation: added a local deepFreeze<T>() helper in src/core/manifest.ts (mirrors Object.freeze convention on YAML_LOAD_OPTIONS/YAML_DUMP_OPTIONS in core/concept.ts L124/L138). Wrapped the GLOBAL_FLAGS and LORE_MANIFEST module-level array literals in deepFreeze(...) so the shared singletons + every nested command/flag entry are frozen once at module load (AC#1). buildManifest()'s returned envelope is also wrapped in deepFreeze(...) since it composes a fresh exitCodeTaxonomy() object per call -- re-freezing the already-frozen GLOBAL_FLAGS/LORE_MANIFEST is a harmless no-op, and this additionally freezes the top-level envelope and the fresh exitCodes object.

New test/help.test.ts describe block 'core/manifest — deep immutability (LCLI-220 AC#1/#2)' (7 tests, all passing): mutating the top-level envelope, pushing onto commands[], reassigning a command's kind, pushing onto / mutating a command's flags[], pushing onto / mutating globalFlags[], and a poison-across-calls test (mutate the manifest from one buildManifest() call, then assert a subsequent buildManifest() call is unaffected). Each mutation attempt is asserted to throw TypeError (bun test runs ESM, strict mode by default) and the underlying data is asserted unchanged afterward. Mutation is exercised via 'as unknown as {...}' casts to simulate the type-bypassing/plain-JS consumer described in the task (readonly TS modifiers are compile-time only) -- consistent with existing 'as any' bypass patterns already used in test/fswrite.test.ts, test/git-adapter.test.ts, test/replace.test.ts, test/rename.test.ts.

No shape/behavior change to manifest DATA: all pre-existing test/help.test.ts assertions pass unchanged (AC#3), confirming the golden exitCodes/kind cross-checks, router lockstep guard, and rendering tests are unaffected by the freeze.

Diff scope: only src/core/manifest.ts and test/help.test.ts changed (git diff --stat confirms no other files touched).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made buildManifest()'s returned Manifest deeply immutable. Added a deepFreeze<T>() helper in src/core/manifest.ts (mirroring the codebase's Object.freeze convention on YAML_LOAD_OPTIONS/YAML_DUMP_OPTIONS in core/concept.ts) and applied it to the GLOBAL_FLAGS and LORE_MANIFEST module singletons at construction plus to buildManifest()'s composed return envelope, so the top-level envelope, commands array, each command entry + its flags array/entries, and globalFlags array/entries are all frozen and a mutation attempt throws TypeError instead of silently corrupting shared state. Added 7 new tests in test/help.test.ts (describe 'core/manifest — deep immutability') proving mutation attempts throw and leave data unaffected, including that poisoning one buildManifest() call's return does not affect a subsequent call. Verified with: bun test (1942 pass, 0 fail, 5498 expect() calls, 47 files), bun run typecheck (clean), bunx biome check on both changed files (no issues). No manifest DATA shape/behavior change -- all pre-existing test/help.test.ts assertions remain green.
<!-- SECTION:FINAL_SUMMARY:END -->
