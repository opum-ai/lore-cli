---
id: LORE-210
title: >-
  Remove indexes.ts's duplicate encodePathSegments; import the canonical encoder
  from links.ts (LORE-28 landed)
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 `src/core/indexes.ts` no longer defines a local `encodePathSegments` or `escapePercent`; it imports `encodePathSegments` from `./links`.
- [ ] #2 The `TODO(LORE-28)` comment block (indexes.ts:445-447) is removed.
- [ ] #3 `buildListing` (indexes.ts) uses the imported encoder; `bun run typecheck` (or `tsc --noEmit`) passes with no unused-import or unresolved-symbol errors.
- [ ] #4 `bun test` passes — existing index generation / byte-stability tests still produce identical index.md link destinations (encoder output is unchanged).
<!-- AC:END -->
