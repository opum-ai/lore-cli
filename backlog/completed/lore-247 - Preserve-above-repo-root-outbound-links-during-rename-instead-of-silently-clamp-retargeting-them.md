---
id: LORE-247
title: >-
  Preserve above-repo-root outbound links during rename instead of silently
  clamp-retargeting them
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 20:59'
labels:
  - core-rewrite-engine
  - codex-review-followup
  - cmd-rename-supersede
dependencies: []
priority: low
type: bug
ordinal: 349000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome.** When `lore rename` relocates a concept, its outbound body links are recomputed for the new directory in `newDestPathFor`'s moved branch (src/core/rewrite.ts:510-521) and handed to `normalizeLink` (src/core/links.ts:124-141). `normalizeLink` roots both operands at a fixed virtual `/` via `posix.join("/", …)` (src/core/links.ts:136-137) to stay cwd-independent, which silently clamps any surplus `..` at that virtual root. For an authored link that resolves ABOVE the repository root (e.g. `[x](../../../../outside/thing.md)` in a doc two levels under `docs/`), the surplus `..` are dropped and the link is quietly retargeted after the move (repro: `targetPath` `../../outside/thing.md`, i.e. two `..` lost) rather than preserved or refused. This task closes that by making the moved branch preserve such a link verbatim.

**Why.** The engine's documented contract (module header, src/core/rewrite.ts:36-38) is that a moved file's links are recomputed by pure path arithmetic so they keep pointing at the same physical target; the clamp breaks that invariant for above-repo targets, corrupting rather than correcting the link. It is a defense-in-depth gap in the same spirit as the shipped operand-confinement guards (LORE-78/79/80/95) but for the moved file's OWN body links, which those guards don't cover.

**Live context.** Guard belongs in the `ctx.isMoved` branch of `newDestPathFor` at src/core/rewrite.ts:510-521, before the `return normalizeLink(repoToPath, targetPath)` at line 521. `targetPath` is already `posix.normalize`d and repo-relative (prefixed `docs/`); a value that begins with `..` (`== '..' || startsWith('../')`) means it escaped above the repo root. Returning `null` there causes `computeBodyEdits` (src/core/rewrite.ts:455-473) to skip the candidate, leaving the original authored bytes untouched. The `decoded.startsWith('/')` absolute sub-branch produces `docs/…` and can never begin with `..`, so only the `posix.join(repoDir, decoded)` sub-branch needs the check.

**Impact / scope.** Low. The trigger is an already-non-portable link that escapes above the repo root — lore never writes one and a normal bundle won't contain one; verified that the legitimate cross-subtree link (a managed `lore:tasks` block pointing at `../../backlog/tasks/…`) resolves to a repo-relative `backlog/…` target (does not begin with `..`) and is NOT affected. Practical effect today is "an already-broken above-repo link becomes a differently-broken link," but the silent retargeting is worth closing.

**Provenance.** doc-2 Codex second-opinion review, low-severity findings, cluster core-rewrite-engine. Original citation src/core/rewrite.ts:362 (now the `rewriteConcept` docstring; live behavior at links.ts:136-137).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In `newDestPathFor`'s `ctx.isMoved` branch (src/core/rewrite.ts:510-521), when the recomputed repo-relative `targetPath` escapes above the repository root (it equals `..` or begins with `../`), the function returns `null` (no edit emitted) instead of calling `normalizeLink`, so the original authored link bytes are preserved verbatim.
- [x] #2 A regression test in test/rename.test.ts renames a concept (moving it across directories) whose body contains an outbound link resolving above the repo root (e.g. `../../../../outside/thing.md`) and asserts that link is byte-for-byte unchanged in the moved file's output.
- [x] #3 A test confirms the legitimate in-repo cross-subtree case is unaffected: a moved concept whose body/managed link targets a repo-relative sibling subtree (e.g. `../../backlog/tasks/foo.md`) is still recomputed to the correct relative link for its new location.
- [x] #4 `bun test` and the typecheck both pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
In newDestPathFor's ctx.isMoved branch (rewrite.ts), after computing targetPath and before calling normalizeLink, check if targetPath === '..' or startsWith('../') (escapes above repo root); if so return null so computeBodyEdits skips the candidate and authored bytes survive verbatim. Add regression tests in test/rename.test.ts: (1) an above-repo-root link (../../../../outside/thing.md) authored 2 levels under docs/, moved across directories, asserted byte-for-byte unchanged; (2) confirm the existing/legit in-repo cross-subtree case (../../backlog/tasks/foo.md) is still correctly recomputed after a deeper move, not swept up by the new guard.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the guard in newDestPathFor's ctx.isMoved branch (rewrite.ts:510-524): when the recomputed repo-relative targetPath equals '..' or starts with '../', return null before calling normalizeLink, so computeBodyEdits skips the candidate and the moved file's authored bytes are preserved verbatim (rewriteConcept falls back to serializeConcept on the original concept when no edits/frontmatter changed). Added two tests to the existing 'rewriteInbound — the moved file's outbound links (move)' describe block in test/rename.test.ts: one asserting a 4x-'../' above-repo-root link is byte-for-byte unchanged (toBe on the full serialized file) across a directory-changing move; one asserting the pre-existing LORE-68 in-repo cross-subtree pattern (../../backlog/tasks/...) is still correctly recomputed (gains segments) on a deeper move, confirming the new guard does not fire for repo-internal targets. Verification: bun test test/rename.test.ts -> 107 pass/0 fail; full bun test -> 1989 pass/0 fail; bun run typecheck -> clean (tsc --noEmit, no output); bunx biome check src/core/rewrite.ts test/rename.test.ts -> no issues. Diff scope confirmed limited to src/core/rewrite.ts + test/rename.test.ts (+ this backlog task file) via git status.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed newDestPathFor's ctx.isMoved branch in src/core/rewrite.ts: when the recomputed repo-relative targetPath escapes above the repository root (== '..' or starts with '../'), the function now returns null instead of calling normalizeLink, so computeBodyEdits skips the candidate and the authored link bytes survive the rename verbatim rather than being silently clamp-retargeted at normalizeLink's virtual root. Added regression coverage in test/rename.test.ts: an above-repo-root link (4x '../') is asserted byte-for-byte unchanged after a directory-changing move; a legitimate in-repo cross-subtree link (../../backlog/tasks/...) is asserted still correctly recomputed (gains '../' segments) on a deeper move, confirming the guard is scoped precisely to above-repo escapes. Verified: bun test test/rename.test.ts (107 pass/0 fail), full bun test (1989 pass/0 fail), bun run typecheck (clean), bunx biome check on both changed files (clean). Change is confined to src/core/rewrite.ts + test/rename.test.ts; src/core/links.ts untouched.
<!-- SECTION:FINAL_SUMMARY:END -->
