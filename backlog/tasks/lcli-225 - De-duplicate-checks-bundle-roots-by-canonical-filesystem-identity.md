---
id: LCLI-225
title: De-duplicate check's bundle roots by canonical filesystem identity
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:29'
labels:
  - cmd-check
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 327000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`lore check` de-duplicates multiple bundle roots by a raw path string, so two spellings that resolve to the SAME physical directory are scanned twice.

**Live context.** `collectBundles` (`src/commands/check.ts:647-665`) keys its `seenRoots` set on `join(root, bundleRoot)` (`:652-656`). `join` already collapses `.`/`..`/trailing slashes, but a symlink alias — or a case-variant on a case-insensitive filesystem (macOS/Windows), e.g. `check docs Docs` — reaches the same directory under a different string and is walked twice, doubling `fileCount` and the finding/error/warning counts (and double-probing URLs under `--external`). The canonical helper already exists at `src/commands/discover.ts:56-58` (`canonicalIdentity`, via `realpathSync.native`) and is exactly how `replace.ts:250`, `validate.ts:160`, and `rename.ts:261` dedup; `check` is the outlier.

**Live constraint.** A nonexistent bundle root must still surface as `expandRoot`'s `not_found`/`denied` LoreError (`src/commands/check.ts:735-753`; pinned by `test/check.test.ts:861`) — `realpath` throws ENOENT on a missing path, so canonicalizing the dedup key must not swallow or replace that error path.

**Scope note.** This also carries the missing multi-root de-dup coverage from doc-2 finding [7] (same cluster): the aliasing/dedup tests are inseparable from this code change and belong here.

**Provenance.** doc-2 Codex second-opinion review, Low-severity cluster `cmd-check`, findings [4] and [7]. Verified still-open against `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two aliased spellings of one root (e.g. `docs` and a symlink that points at it) are de-duplicated: fileCount and finding counts are not doubled.
- [x] #2 A case-variant alias is de-duplicated on case-insensitive filesystems, with the assertion guarded so it stays portable on case-sensitive CI.
- [x] #3 A nonexistent bundle root still throws the not_found (exit 3) / denied error from expandRoot, unchanged.
- [x] #4 The existing 'the same root passed twice de-duplicates its files' and 'two distinct roots are checked independently' tests still pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Change collectBundles' seenRoots dedup key from the raw join(root, bundleRoot) string to canonicalIdentity(absRoot) (discover.ts:56, realpathSync.native), matching replace.ts/validate.ts/rename.ts's existing dedup pattern. 2. Rely on canonicalIdentity's own try/catch fallback (returns the path verbatim on a realpath failure) so a nonexistent root's dedup key never collides and expandRoot still runs and throws its own not_found/denied LoreError unchanged. 3. Add tests: symlink-alias root dedup (POSIX-only skipIf), case-variant root dedup (skipIf guarded by a runtime case-insensitive-fs probe, not process.platform, so it's accurate and portable to case-sensitive CI), and a nonexistent-root-among-several regression proving the fix doesn't swallow the not_found error. 4. Verify existing 'same root twice' and 'two distinct roots' tests still pass unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test -> 1926 pass / 0 fail (47 files), bun run typecheck -> clean, bunx biome check src/commands/check.ts test/check.test.ts -> no issues. AC#1: new POSIX-only symlink-alias-root test (docs + docs-alias symlink) shows fileCount=3 (not 6) and errorCount=1 (not 2) — ran (not skipped) on this macOS dev box. AC#2: new case-variant-root test (docs + Docs) guarded by a runtime CASE_INSENSITIVE_FS probe (throwaway temp-file existsSync check, not process.platform) rather than assumed — ran (not skipped) here, same fileCount/errorCount evidence; will self-skip on case-sensitive CI (ubuntu). AC#3: existing 'a nonexistent bundle root is a not_found error' test (still green) plus a new 'nonexistent among several' regression (['docs','does-not-exist']) both still throw /does not exist/ — canonicalIdentity's internal try/catch fallback (returns the path verbatim on realpath ENOENT) means the dedup key for a missing root never short-circuits expandRoot's own not_found/denied classification. AC#4: existing 'the same root passed twice de-duplicates its files' and 'two distinct roots are checked independently' tests re-ran individually via bun test -t, both green, unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
collectBundles (src/commands/check.ts) now de-duplicates bundle roots by canonicalIdentity(absRoot) (discover.ts's realpathSync.native-based helper) instead of the raw joined path string — matching the dedup pattern replace.ts, validate.ts, and rename.ts already use. A symlink alias or a case-variant spelling of a bundle root that resolves to the same physical directory is now walked once, not twice, so fileCount and finding counts are no longer doubled. canonicalIdentity's own fallback (verbatim path on a realpath failure) means a nonexistent bundle root's dedup key never collides with anything real, so expandRoot's not_found/denied LoreError still fires unchanged for a missing root. Added 3 tests to test/check.test.ts: a POSIX-only symlink-alias-root dedup test, a case-variant-root dedup test guarded by a runtime case-insensitive-filesystem probe (portable to case-sensitive CI), and a nonexistent-root-among-several regression. Verified with bun test (1926 pass / 0 fail across 47 files), bun run typecheck (clean), and bunx biome check on both changed files (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
