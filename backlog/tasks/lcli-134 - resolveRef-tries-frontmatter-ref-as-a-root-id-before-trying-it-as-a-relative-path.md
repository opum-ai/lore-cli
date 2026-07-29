---
id: LCLI-134
title: >-
  resolveRef tries frontmatter ref as a root id before trying it as a relative
  path
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:26'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveRef (src/core/bundle.ts:429-448) computes `idFromPath(decoded)` and returns it immediately if that id exists in the bundle, before ever attempting to resolve `decoded` as a path relative to the referring file's directory via resolvePath. If an author writes an explicit relative (or `.md`-suffixed) ref that happens to normalize to the same string as a different, unrelated concept's bundle-root id, resolveRef silently binds the ref to that unrelated concept instead of the relative target the author meant, with no warning or error surfaced.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A frontmatter ref that is written as a relative/`.md`-suffixed path resolves to the concept found by joining it to the referring file's directory when that resolution succeeds, even if the same string also happens to match a distinct concept's bundle-root id.
- [x] #2 A regression test in test/bundle.test.ts constructs a bundle where a relative ref's dir-relative resolution and its root-id resolution point at two different concepts, and asserts resolveRef returns the dir-relative (intended) target.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In resolveRef (src/core/bundle.ts), swap resolution order: try resolvePath(decoded, dir, byId) first (dir-relative path form); only if that returns null, fall back to the bundle-root id form (idFromPath + byId.has). This makes the dir-relative interpretation win when both would resolve, since it is the more specific/anchored reading and is what an author literally wrote as a relative path. 2. Update the resolveRef docstring to describe the new precedence and cite LCLI-134. 3. Add regression tests in test/bundle.test.ts: (a) a relative/.md-suffixed ref that dir-joins to one real concept while also colliding (bare of .md) with a distinct root-id concept must resolve to the dir-relative concept; (b) a genuine bundle-relative id ref (lore supersede's own authoring form) with no dir-relative match must still fall back to id resolution, unaffected by the reorder. 4. Verify the new collision test fails on the pre-fix code (stash src, run test) to prove it reproduces the bug, then restore. 5. bun test + bun run typecheck full green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test -> 1773 pass / 0 fail (5005 expect calls) across 47 files. bun run typecheck -> clean (tsc --noEmit, no errors). New collision test confirmed to reproduce the pre-fix bug: git-stashed src/core/bundle.ts alone, re-ran test/bundle.test.ts, the new 'dir-relative path is tried before the bundle-root id' test failed exactly as expected (resolved to the decoy root id 'sibling' instead of 'notes/sibling'); restored the fix and it passes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed resolveRef (src/core/bundle.ts) to try the dir-relative path form (resolvePath) BEFORE the bundle-root id form, so an author-written relative/.md-suffixed ref that successfully dir-joins to a real concept wins over a same-string coincidental root id (previously the id-form check ran first and silently won, per LCLI-134). Bare-id refs (as lore supersede itself writes) are unaffected, since they still fall back to id resolution when dir-joining produces no real concept. Added two regression tests to test/bundle.test.ts: one constructing the exact collision (relative ref dir-joins to 'notes/sibling' while also colliding, bare of .md, with a distinct root concept 'sibling') asserting the dir-relative concept wins, and one guarding that a genuine bundle-relative id ref with no dir-relative match still falls back correctly. Verified the collision test fails against the pre-fix code (stashed src, ran suite, restored). Verification: bun test -> 1773 pass / 0 fail (5005 expect calls, 47 files); bun run typecheck -> clean.
<!-- SECTION:FINAL_SUMMARY:END -->
