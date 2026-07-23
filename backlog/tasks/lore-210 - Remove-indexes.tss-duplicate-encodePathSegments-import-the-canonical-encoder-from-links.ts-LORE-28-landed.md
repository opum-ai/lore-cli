---
id: LORE-210
title: >-
  Remove indexes.ts's duplicate encodePathSegments; import the canonical encoder
  from links.ts (LORE-28 landed)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 17:10'
labels:
  - core-index-context
  - codex-review-followup
dependencies: []
priority: low
type: chore
ordinal: 312000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `src/core/indexes.ts` has a single source of truth for the portable path-segment encoder, eliminating the drift risk the copy carries.

**Current state:** `src/core/indexes.ts:448-458` keeps a private `encodePathSegments` and its `escapePercent` helper, with a `TODO(LORE-28)` at lines 445-447 saying to delete the copy and import from `./links` once LORE-28/PR #19 lands on `dev`. That has happened: LORE-28 is Done, and `src/core/links.ts:169` exports the canonical `encodePathSegments` (`encodeURIComponent` + escape of the markdown-significant `! ' ( ) *`, uppercase hex). The two implementations are byte-equivalent today, so this is a maintainability/dedup fix, not a behavior change — but the duplicate is exactly what the TODO warned would drift.

**Fix direction:** Import `encodePathSegments` from `./links` in `indexes.ts` (safe — links.ts imports only `node:path`, `../errors`, `./concept`, so no import cycle), delete the private `encodePathSegments` + `escapePercent` (lines ~445-458), and remove the stale TODO. Confirm the single call site in `buildListing` (indexes.ts:213/217) still resolves.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity finding `src/core/indexes.ts:346`, cluster `core-index-context`. Round-3 re-audit confirmed the duplicate + stale TODO are still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `src/core/indexes.ts` no longer defines a local `encodePathSegments` or `escapePercent`; it imports `encodePathSegments` from `./links`.
- [x] #2 The `TODO(LORE-28)` comment block (indexes.ts:445-447) is removed.
- [x] #3 `buildListing` (indexes.ts) uses the imported encoder; `bun run typecheck` (or `tsc --noEmit`) passes with no unused-import or unresolved-symbol errors.
- [x] #4 `bun test` passes — existing index generation / byte-stability tests still produce identical index.md link destinations (encoder output is unchanged).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Import encodePathSegments from ./links in indexes.ts. 2. Delete the private encodePathSegments+escapePercent (with the stale TODO(LORE-28) doc block) at indexes.ts:437-458. 3. Confirm buildListing's two call sites (indexes.ts:214,218) resolve to the imported encoder. 4. Verify: bun run typecheck, full bun test (byte-stability/index-generation suites), bunx biome check on the changed file, bun run src/cli.ts check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun run typecheck clean (tsc --noEmit, no unused-import/unresolved-symbol errors). Full bun test: 1917 pass, 0 fail, 5401 expect() calls across 47 files — index-generation/byte-stability suites produce identical index.md link destinations (encoder output unchanged, confirmed byte-equivalent with links.ts's canonical encodePathSegments). bun run src/cli.ts check: 38 files, 0 errors, 0 warnings. bunx biome check src/core/indexes.ts: clean (0 errors) after removing a stray trailing blank line the deletion left behind. Final diff on src/core/indexes.ts is exactly: +1 import line (encodePathSegments from ./links) and -24 lines (the private encodePathSegments/escapePercent functions plus the stale TODO(LORE-28) doc comment). Both call sites in buildListing (now indexes.ts:214,218) resolve to the imported encoder.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deduplicated the portable path-segment encoder: src/core/indexes.ts now imports encodePathSegments from ./links instead of keeping a private copy. Deleted the local encodePathSegments/escapePercent functions and the stale TODO(LORE-28) doc comment (indexes.ts:437-458); buildListing's two call sites resolve unchanged to the imported encoder. Pure dedup, byte-identical output: bun run typecheck is clean, full bun test is 1917 pass/0 fail (index generation and byte-stability tests confirm identical index.md link destinations), bun run src/cli.ts check is 0 errors/0 warnings, and bunx biome check on the changed file is clean.
<!-- SECTION:FINAL_SUMMARY:END -->
