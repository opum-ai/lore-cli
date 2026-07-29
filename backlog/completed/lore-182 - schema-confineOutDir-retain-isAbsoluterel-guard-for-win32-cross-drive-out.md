---
id: LORE-182
title: 'schema confineOutDir: retain isAbsolute(rel) guard for win32 cross-drive --out'
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-22 17:14'
updated_date: '2026-07-23 09:26'
labels:
  - cmd-meta-a
dependencies: []
priority: low
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LORE-124 replaced confineOutDir's isAbsolute(rel) clause with isAbsolute(out) on the raw --out arg, calling the old clause 'dead code on POSIX'. Verified via path.win32 it was LIVE on Windows (in the CI matrix): for a cross-drive drive-relative --out (e.g. 'C:foo' with the repo on 'D:'), isAbsolute(out) is false and rel is not a '..' climb, but path.relative returns an absolute path — so the old isAbsolute(rel) clause rejected it while the new guard lets it through. Blast radius is contained (pruneOrphans unreachable; writes stay lexically inside repo; NTFS rejects the ':' component -> an io-mapped LoreError), so the net effect is a confusing IO error instead of a clean usage error on an exotic win32-only input — no traversal, no deletion, no data loss. Fix: retain '|| isAbsolute(rel)' belt-and-suspenders so win32 cross-drive drive-relative --out surfaces the clean usage error again. Flagged by the wave-6 LORE-124 review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 confineOutDir rejects a win32 cross-drive drive-relative --out (e.g. 'C:foo' with repo root on another drive) with the clean usage LoreError, verified via a path.win32-based unit test matching the codebase's existing win32-path test convention
- [x] #2 All existing schema-export absolute/relative --out behavior from LORE-124 is preserved on POSIX
- [x] #3 Typecheck and the full bun test suite are green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Restore confineOutDir's belt-and-suspenders || isAbsolute(rel) clause that LORE-124 removed. 2. Make the win32-specific behavior deterministically unit-testable on any host by parameterizing confineOutDir with an injectable PathOps (resolve/relative/isAbsolute/sep), defaulting to the real host node:path functions (HOST_PATH) at every production call site — production behavior byte-identical to before. 3. Export confineOutDir and add a test in test/schema-export.test.ts that calls it directly with node:path's own win32 namespace injected, proving a clean usage LoreError for a cross-drive drive-relative --out ('C:foo' against root 'D:\\repo') on ANY test host, not gated behind process.platform. 4. Verify: temporarily remove the restored clause to confirm the new test fails without the fix, then restore. 5. Run full bun test, typecheck, lint; confirm existing POSIX --out behavior (LORE-124 regression tests) is unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restored confineOutDir's '|| isAbsolute(rel)' clause LORE-124 removed. Made it deterministically win32-testable on any host: confineOutDir now takes an injectable PathOps (resolve/relative/isAbsolute/sep), defaulting to HOST_PATH (the real node:path functions) at every production call site — behavior byte-identical to before for all existing callers. Exported confineOutDir; added a test in test/schema-export.test.ts calling it directly with node:path's own win32 namespace injected for root='D:\\repo', out='C:foo', proving a clean usage LoreError. Verified the test is a real regression guard: temporarily removed the restored clause and confirmed the new test fails (thrown undefined), then restored it and confirmed it passes. AC#2: existing LORE-124 absolute/relative --out POSIX tests (all in the '--out'/'argument errors' describe blocks) still pass unmodified; manually confirmed with node:path's plain functions that isAbsolute(rel) stays false for every POSIX case (relative dir, '../escaped', absolute-inside, '.') so the restored clause is inert there, matching the LORE-124 docblock claim. AC#3: bun run typecheck clean (tsc --noEmit, 0 errors); full bun test: 1888 pass, 0 fail, 5327 expect() calls across 47 files. bun run lint: zero findings in the two files this task touches (src/commands/schema.ts, test/schema-export.test.ts); biome check . does report 7 pre-existing findings (3 errors, 4 infos) in six unrelated files (src/core/managed-block.ts, test/managed-block.test.ts, test/supersede.test.ts, test/context.test.ts, test/replace.test.ts, test/validate.test.ts) that are already present on dev's current tip (ba2c12e) before this branch's changes — confirmed via git status showing only this task's two files modified — and are out of this task's pinned scope (src/commands/schema.ts + test/schema-export.test.ts only) per the campaign's file-ownership rules, so left untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored confineOutDir's belt-and-suspenders '|| isAbsolute(rel)' clause (LORE-124 had removed it as 'dead on POSIX'), so a win32 cross-drive drive-relative --out (e.g. 'C:foo' with the repo on 'D:') again surfaces the clean usage LoreError instead of a confusing IO error. Made the fix deterministically testable on any host by giving confineOutDir an injectable PathOps parameter (resolve/relative/isAbsolute/sep) that defaults to the real host node:path functions everywhere in production; the new test (test/schema-export.test.ts) calls the exported confineOutDir directly with node:path's own win32 namespace injected to prove the LoreError for real win32 semantics, without depending on process.platform or an actual Windows runner. Verified as a real regression guard (fails without the fix, passes with it). Verified: bun run typecheck clean; full bun test 1888 pass/0 fail (47 files); bun run lint clean for both touched files (pre-existing, out-of-scope failures in six unrelated files already on dev's tip were left untouched per pinned-scope rules).
<!-- SECTION:FINAL_SUMMARY:END -->
