---
id: LORE-117
title: writeFileAtomic drops destination's file mode/ownership on overwrite
status: Done
assignee:
  - '@sonnet'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 16:28'
labels:
  - codex-review-followup
  - cmd-crud-b
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
writeFileAtomic (src/commands/fswrite.ts:187-221), used by `lore sync` to atomically overwrite existing docs, writes its temp file with writeFileSync(tmpPath, contents) using no explicit mode and never stats the destination's existing permissions or ownership before renameSync(tmpPath, absPath) replaces it. As a result, any non-default mode (e.g. a doc made group-writable, or one with restrictive 600 perms) or ownership on the original file is silently replaced by the temp file's default-umask mode after every sync write. This is a regression risk for any docs bundle that relies on file permissions for access control or shared-editing setups.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 writeFileAtomic preserves the destination file's existing mode bits (and ownership where the process has privilege to do so) across an overwrite, verified by a test that chmods a target file to a non-default mode (e.g. 0o640), runs writeFileAtomic against it, and asserts the mode is unchanged afterward.
- [x] #2 The preservation logic correctly handles the first-write case (destination does not yet exist) by falling back to default-umask behavior without erroring when there is no prior mode to preserve.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In writeFileAtomic, statSync the destination before writing the temp file (swallow any error -> null, treated as first-write).
2. After the temp write succeeds, if a prior stat exists: chmodSync temp file to dest mode&0o7777; best-effort chownSync to dest uid/gid, swallowing failures (EPERM/unsupported).
3. Keep temp+rename atomicity and signature unchanged; first-write case skips preservation, no new error path.
4. Add test/fswrite.test.ts: AC1 chmod dest to 0o640 then overwrite, assert mode unchanged; AC2 first-write succeeds without throwing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: writeFileAtomic (fswrite.ts) now statSync's the destination before writing the temp file. If a prior file exists, its mode is carried onto the temp file via chmodSync(mode & 0o7777) and its ownership is applied best-effort via chownSync (swallowing failures -- EPERM when unprivileged, or unsupported on some platforms). If the destination doesn't exist (or the stat otherwise fails), preservation is skipped and the write falls back to plain default-umask behavior, matching prior behavior exactly -- no new error path. Temp+rename atomicity and the function's signature are unchanged.

Verification: new test/fswrite.test.ts (5 tests, 12 expect calls) covers AC#1 (0o640 and 0o600 modes survive an overwrite, and survive a second repeated overwrite) and AC#2 (first write with no prior destination succeeds without throwing, leaves no stray temp file). Existing writeFileAtomic suite in test/replace.test.ts (create/overwrite/conflict/cleanup cases) still passes unchanged, confirming no regression. Full bun test suite: 1734 pass / 0 fail across 46 files (4887 expect() calls). bun run typecheck (tsc --noEmit): clean, no errors. bunx biome check on both changed files: clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed writeFileAtomic (src/commands/fswrite.ts) to preserve a destination file's mode (and best-effort ownership) across an atomic overwrite instead of silently reverting to the process's default umask. Before writing the temp file, the destination is statSync'd; if it exists, the temp file gets chmodSync'd to the destination's mode bits and chownSync'd to its uid/gid (ownership failures swallowed, e.g. EPERM when unprivileged); if it doesn't exist, preservation is skipped and the first write proceeds exactly as before. Verified with a new test/fswrite.test.ts (5 tests: 0o640 and 0o600 modes survive an overwrite and a repeated overwrite; first-write with no prior destination succeeds without erroring and leaves no stray temp file) plus the full bun test suite (1734 pass / 0 fail, 46 files) and tsc --noEmit (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
