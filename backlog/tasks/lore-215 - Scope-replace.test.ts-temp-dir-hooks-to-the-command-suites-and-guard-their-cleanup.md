---
id: LORE-215
title: >-
  Scope replace.test.ts temp-dir hooks to the command suites and guard their
  cleanup
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 The pure-engine suites in test/replace.test.ts (`replaceInText — *`, `managedRanges`, `MANAGED_REGION_LOCATORS — *`, `mergeRanges`) no longer run the `root` mkdtempSync/mkdirSync/rmSync hooks — those tests perform no temp-directory creation or removal.
- [ ] #2 The `root` temp-directory beforeEach/afterEach apply only to the command-level suites that actually use `root` (the `lore replace — *` describes and the router-integration describe); the fswrite suites, which manage their own `dir`, are not given a redundant `root`.
- [ ] #3 The temp-directory cleanup no longer throws a secondary error when setup did not assign `root` (e.g. it is skipped when `root` is unset), so a `beforeEach`/mkdtempSync failure surfaces as the original error rather than a masking `rmSync(undefined, …)` TypeError.
- [ ] #4 `bun test test/replace.test.ts` passes with all tests green (85 tests at time of filing).
<!-- AC:END -->
