---
id: LORE-225
title: De-duplicate check's bundle roots by canonical filesystem identity
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 Two aliased spellings of one root (e.g. `docs` and a symlink that points at it) are de-duplicated: fileCount and finding counts are not doubled.
- [ ] #2 A case-variant alias is de-duplicated on case-insensitive filesystems, with the assertion guarded so it stays portable on case-sensitive CI.
- [ ] #3 A nonexistent bundle root still throws the not_found (exit 3) / denied error from expandRoot, unchanged.
- [ ] #4 The existing 'the same root passed twice de-duplicates its files' and 'two distinct roots are checked independently' tests still pass.
<!-- AC:END -->
