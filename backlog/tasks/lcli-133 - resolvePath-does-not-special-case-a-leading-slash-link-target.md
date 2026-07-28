---
id: LCLI-133
title: resolvePath does not special-case a leading-slash link target
status: Done
assignee:
  - '@claude'
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
ordinal: 147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolvePath (src/core/bundle.ts:465-468) always joins its `path` argument onto the linking file's `dir` via `posix.join(dir, path)`, with no special case for a bundle-root-absolute (`/`-prefixed) target. core/check.ts's linkFindings (check.ts:518) explicitly strips a leading `/` and resolves the remainder against the bundle root instead of the linking directory. Because bundle.ts's resolver (used by resolveRef and the graph builder) and check.ts's resolver (used by the link-check gate) disagree on this one input shape, a `/`-absolute frontmatter ref or link can be classified as resolving to a different concept — or as broken — depending on which code path evaluates it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For a `/`-absolute path input (e.g. `/foo/bar.md`), resolvePath resolves it against the bundle root the same way check.ts's linkFindings does, rather than joining it onto the linking file's directory.
- [x] #2 A regression test in test/bundle.test.ts covers a `/`-absolute ref/path resolving to the same concept id whether resolved via resolvePath or via the check.ts link-check gate, for a bundle where root-relative resolution and dir-relative resolution would otherwise disagree.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Mirror check.ts's linkFindings: in resolvePath (bundle.ts), special-case a leading '/' target by stripping it and resolving the remainder as bundle-root-relative (dir is already root-relative, matching check.ts's posix.dirname(file.path)), instead of posix.join(dir, path). Non-slash inputs keep joining to dir unchanged. Add a regression test in test/bundle.test.ts with nested dirs where root-relative vs dir-relative would disagree, asserting resolvePath and the check.ts link gate agree on the same concept id.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed resolvePath (src/core/bundle.ts) to special-case a leading-'/' path: strip the slash and resolve the remainder directly (dir is already bundle-root-relative, per posix.dirname(concept.path)), instead of posix.join(dir, path). Non-slash targets are unaffected (still joined onto dir). Added 4 regression tests in test/bundle.test.ts, including one that cross-checks buildGraph's resolvePath-driven edge against check.ts's checkBundle link-check gate on the same /-absolute target in a bundle where root-relative and dir-relative resolution name two different real concepts (a decoy at the dir-joined path) -- confirmed by heading-anchor fingerprint since checkBundle doesn't expose a resolved id. Verified the new tests actually catch the bug: reverted the bundle.ts fix in isolation and confirmed 3 of the 4 new tests fail with the pre-fix behavior (resolving to the decoy), then restored the fix and reran green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
resolvePath now special-cases a /-absolute target (strip leading '/', resolve remainder as bundle-root-relative) so it agrees with check.ts's linkFindings on the same input, instead of always posix.join(dir, path). Verified: bun test test/bundle.test.ts -> 54 pass/0 fail (was 51 pass/3 fail against the pre-fix code, confirming the tests catch the regression); full bun test -> 1742 pass/0 fail across 46 files; bun run typecheck (tsc --noEmit) -> clean; bun run lint (biome check .) -> exit 0, only 4 pre-existing infos in unrelated files.
<!-- SECTION:FINAL_SUMMARY:END -->
