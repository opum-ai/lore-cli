---
id: LCLI-202
title: >-
  Correct order.ts module-doc rationale: default Array.prototype.sort is
  code-unit-ordered and stable, not locale/engine-dependent
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - core-engine-b
  - codex-review-followup
  - docs
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: docs
ordinal: 304000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** the order.ts module doc justifies the shared compareCodeUnits comparator with an accurate rationale.

**Why:** src/core/order.ts:3-4 currently says compareCodeUnits is "stable and locale-independent (unlike the default `Array.prototype.sort`, which sorts by locale and is engine-dependent)". Per ECMA-262, the no-comparator default sorts by UTF-16 code-unit order after ToString (it is not locale-aware) and has been required to be stable since ES2019 — so for string arrays the default already matches compareCodeUnits. The real justification for the explicit comparator is a single named determinism primitive that can never be spelled two ways and can never be accidentally a locale-aware compare (e.g. localeCompare) — not that the default is locale/engine-dependent. The comparator implementation (order.ts:11-13) is correct and must not change.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity, cluster core-engine-b.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The order.ts module doc no longer states the default `Array.prototype.sort` "sorts by locale" or is "engine-dependent" for its ordering.
- [x] #2 The revised rationale accurately explains why an explicit shared code-unit comparator is kept (single source of truth / explicit UTF-16 code-unit ordering, avoiding an accidental locale-aware comparison) and is consistent with ECMA-262 (code-unit default, stable since ES2019).
- [x] #3 No behaviour change: the compareCodeUnits implementation is untouched and the full `bun test` suite stays green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite src/core/order.ts module doc comment (lines 3-9) only: remove the inaccurate claim that default Array.prototype.sort sorts by locale/is engine-dependent (per ECMA-262 the no-comparator default is UTF-16 code-unit ordered and stable since ES2019). 2. Replace rationale with: the explicit shared compareCodeUnits comparator exists as a single named determinism primitive / single source of truth for explicit UTF-16 code-unit ordering so it can never be accidentally spelled as a locale-aware compare (e.g. localeCompare) or spelled two different ways across call sites. 3. Do not touch compareCodeUnits function body (lines 11-13). 4. Run bun test (expect same pass count, 0 failures) and bun run typecheck (clean). 5. bunx biome check src/core/order.ts to confirm no new lint errors. 6. Diff-check compareCodeUnits body is byte-identical. 7. Finalize task: check ACs with evidence, final summary, status Done. 8. Commit only src/core/order.ts + backlog task file, conventional commit with Refs: LCLI-202 trailer, push branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote src/core/order.ts module doc (lines 3-9 only). Removed inaccurate claim that default Array.prototype.sort sorts by locale / is engine-dependent. New rationale: per ECMA-262, no-comparator Array.prototype.sort is UTF-16 code-unit ordered and stable since ES2019, matching compareCodeUnits already; the explicit comparator is kept as the single source of truth so every call site spells the ordering the same explicit way and none can drift into an accidental locale-aware compare (e.g. localeCompare). compareCodeUnits implementation (lines 11-13) is byte-unchanged, confirmed via git diff (only comment lines in the hunk). Verification: bun test -> 1917 pass, 0 fail, 5401 expect() calls across 47 files; bun run typecheck -> clean (tsc --noEmit, no output); bunx biome check src/core/order.ts -> no issues, no fixes applied.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected the src/core/order.ts module doc rationale for compareCodeUnits. The old text falsely claimed the default (no-comparator) Array.prototype.sort 'sorts by locale' and is 'engine-dependent'; per ECMA-262 it is UTF-16 code-unit ordered after ToString and has been required stable since ES2019, so it already matches compareCodeUnits for strings. The doc now states that fact and explains the real reason the named comparator is kept: it is the single source of truth for explicit UTF-16 code-unit ordering, so every call site spells it the same way and none can accidentally drift into a locale-aware compare like localeCompare. No behavior change: compareCodeUnits (lines 11-13) is byte-identical (verified via git diff hunk boundaries). Verified with bun test (1917 pass, 0 fail, 47 files), bun run typecheck (clean), and bunx biome check src/core/order.ts (no issues).
<!-- SECTION:FINAL_SUMMARY:END -->
