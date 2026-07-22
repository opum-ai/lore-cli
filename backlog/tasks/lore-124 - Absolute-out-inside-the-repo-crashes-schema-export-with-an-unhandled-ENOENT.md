---
id: LORE-124
title: Absolute --out inside the repo crashes schema export with an unhandled ENOENT
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 17:01'
labels:
  - codex-review-followup
  - cmd-meta-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
confineOutDir (src/commands/schema.ts:135-141) only checks whether the resolved path escapes the repo root; it never rejects an absolute --out value that happens to resolve inside the repo. Because runSchema then passes the raw absolute outArg (not the resolved absOutDir) into emitSchemaFiles, ensureDir(options.root, outArg) (line 106), and join(options.root, file.path), an absolute --out double-prefixes the root. Reproduced against current code: `lore schema export --out <absolute path equal to .lore/schemas>` does not throw from confineOutDir, but then crashes with an unhandled `ENOENT: no such file or directory, scandir '.../.lore/schemas'` thrown from pruneOrphans's readdirSync, because the bogus double-prefixed directory was created instead of the real one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running `lore schema export --out <absolute path>` (whether inside or outside the repo) either throws a clean usage LoreError naming the problem, or is resolved/normalized correctly so no double-prefixed directory is created and no unhandled ENOENT is thrown.
- [x] #2 A regression test in test/schema.test.ts (or test/schema-export.test.ts) passes an absolute --out path resolving inside the repo and asserts the command exits cleanly (or with a usage error) rather than throwing an unhandled ENOENT.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
confineOutDir only checked isAbsolute(rel) (dead code on POSIX — relative() never returns an absolute path) instead of isAbsolute(out), so an absolute --out resolving inside the repo slipped past the guard and got double-prefixed downstream. Fix: check isAbsolute(out) directly, rejecting every absolute --out as a usage LoreError (inside or outside the repo). Add a regression test in test/schema-export.test.ts covering an absolute --out resolving inside the repo.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed confineOutDir (src/commands/schema.ts): it checked isAbsolute(rel) on the post-relative() result, which is dead code on POSIX (relative() never returns an absolute path), so an absolute --out resolving inside the repo slipped past the guard. runSchema then passed the raw absolute outArg into emitSchemaFiles/ensureDir/join(root, file.path), double-prefixing the root and crashing pruneOrphans with an unhandled ENOENT. Now checks isAbsolute(out) on the raw argument, rejecting every absolute --out (inside or outside the repo) as a clean usage LoreError. Added a regression test in test/schema-export.test.ts asserting an absolute --out resolving inside the repo throws a usage error mentioning "inside the repo" and leaves the temp root completely empty (no double-prefixed dir, no partial write). Verified: new test passes (bun test test/schema-export.test.ts test/schema.test.ts -> 62 pass/0 fail); full suite bun test -> 1739 pass/0 fail across 46 files; bun run typecheck clean; bun run lint clean (0 errors; pre-existing unrelated infos in link.test.ts/supersede.test.ts untouched).
<!-- SECTION:FINAL_SUMMARY:END -->
