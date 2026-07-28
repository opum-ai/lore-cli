---
id: LCLI-227
title: >-
  new.ts: parse arguments before loading the profile so a malformed profile.toml
  can't mask a usage error
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - cmd-crud-a
  - codex-review-followup
  - cli-args
dependencies: []
priority: low
type: bug
ordinal: 329000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `lore new` should report an obvious argument error (missing type/title) even when `.lore/profile.toml` is malformed, matching every sibling mutation command.

**Live state:** In `runNew` (src/commands/new.ts:91-92) `loadProfile({ root: options.root })` runs on line 91, *before* `parseNewArgs(options.args)` on line 92. `loadProfile` throws a LoreError on a syntactically-broken profile (parseToml, src/core/profile.ts:267-274). So running `lore new` with no arguments in a repo whose `.lore/profile.toml` is malformed surfaces the profile-parse error and hides the intended `"lore new" needs a type` usage error (new.ts:234-235).

**Why it's a defect:** The sibling commands all validate their own arguments before any profile I/O — link.ts `prepare` (parseLinkArgs:597 → loadProfile:609), rename.ts (parseRenameArgs:124 → loadProfile:148), supersede.ts (parseSupersedeArgs:111 → loadProfile:124). `new` is the lone outlier, so an obvious usage mistake is reported as a config error. The reorder is safe: `parseNewArgs` needs no profile, and every consumer of the loaded profile (`canonicalType` at new.ts:93, `resolveTemplate`, `buildNewConcept`) runs after both statements.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster cmd-crud-a. Round-3 re-audit confirmed the defect is still live on dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `runNew` calls `parseNewArgs(options.args)` before `loadProfile(...)`; the loaded profile is still threaded to `canonicalType`, `resolveTemplate`, and `buildNewConcept` unchanged.
- [x] #2 Running `lore new` with no positional arguments in a repo whose `.lore/profile.toml` is syntactically invalid exits 2 with the `usage`-type "`lore new` needs a type" error (not the TOML-parse error).
- [x] #3 A regression test in the new.ts test file covers the malformed-profile + missing-args case and asserts the usage error / exit 2.
- [x] #4 All existing new.ts behavior (valid runs, profile-declared types, template resolution) is unchanged and the full test suite passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read src/commands/new.ts runNew (lines ~85-100) and confirm loadProfile precedes parseNewArgs. 2. Swap order: call parseNewArgs(options.args) first, then loadProfile(...), keeping downstream threading (canonicalType/resolveTemplate/buildNewConcept) unchanged. 3. Add regression test in test/new.test.ts: malformed .lore/profile.toml + no positional args -> expect usage error 'lore new' needs a type + exit code 2 (not TOML parse error). 4. Run bun test + bun run typecheck; run bunx biome check on changed files. 5. Finalize backlog task with evidence, commit, push.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Swapped runNew's statement order in src/commands/new.ts: parseNewArgs(options.args) now runs before loadProfile({ root: options.root }); every downstream profile consumer (canonicalType, resolveTemplate via resolveModeline/build path, buildNewConcept) is unaffected — both statements still run before them, unchanged. Added regression test in test/new.test.ts ('regression: a missing type is still a usage error even with a syntactically invalid .lore/profile.toml (LCLI-227)') that writes a syntactically-broken .lore/profile.toml ('a = = 1', mirrors config.test.ts's malformed-TOML convention) and asserts runNew([]) throws a usage LoreError with message '`lore new` needs a type' (not a TOML message). Verified end-to-end against the built CLI in a scratch repo: `lore new` with no args + malformed profile.toml -> stderr 'error: `lore new` needs a type' + hint, process exit code 2 (confirmed via $?). Full bun test: 1924 pass / 0 fail across 47 files (was 1923/0 pre-change; +1 new test). bun run typecheck: clean (tsc --noEmit, no output). bunx biome check on both changed files: 'Checked 2 files in 26ms. No fixes applied.' Diff scoped to exactly src/commands/new.ts + test/new.test.ts + this task file (verified via git status --porcelain).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reordered runNew (src/commands/new.ts) so parseNewArgs(options.args) executes before loadProfile({ root: options.root }), matching the sibling mutation commands (link/rename/supersede) — a malformed .lore/profile.toml can no longer mask the '`lore new` needs a type' usage error behind a TOML-parse validation error. Every profile consumer (canonicalType, resolveTemplate, buildNewConcept) still runs after both statements, unchanged. Added a regression test in test/new.test.ts covering the malformed-profile + missing-args case. Verified: full bun test 1924/0 (was 1923/0), bun run typecheck clean, biome clean on changed files, and a direct CLI run in a scratch repo showing exit 2 with the usage message (not the TOML error).
<!-- SECTION:FINAL_SUMMARY:END -->
