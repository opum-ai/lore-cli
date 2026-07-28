---
id: LCLI-108
title: >-
  readConfigText maps EACCES/EPERM config read failures to 'validation' not
  'denied'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:25'
labels:
  - codex-review-followup
  - cli-entry-state
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
readConfigText in src/config.ts (lines 143-156) only special-cases ENOENT (returning undefined for a missing config); every other read errno, including EACCES/EPERM permission errors, falls through to fail() at line 150-154 which throws a `validation`-typed LoreError. This contradicts the codebase-wide convention (see src/errors.ts's ioError, which throws `denied` for EACCES/EPERM at line 281/332) where permission errors are surfaced as the `denied` error type. A user who lacks read permission on lore.toml gets the wrong ErrorType/exit code and a 'fix the TOML' framing instead of a permissions diagnostic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When readFileSync on the config path fails with EACCES or EPERM, readConfigText raises a LoreError with type `denied` (matching the codebase's shared EACCES/EPERM → denied contract), not `validation`.
- [x] #2 A new test in test/config.test.ts simulates an EACCES/EPERM failure reading the config file and asserts the resulting error's `type` is `denied` with an exit code matching EXIT_CODES.denied.
- [x] #3 The existing ENOENT (missing file → undefined/default config) behavior is unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/config.ts's readConfigText, before falling through to the existing validation fail(), add a branch for EACCES/EPERM (via the file's existing isErrnoCode helper) that throws a denied LoreError with a permissions-focused hint, matching the codebase-wide EACCES/EPERM -> denied contract (errors.ts's ioError/readFileIfPresent). Leave ENOENT->undefined and the catch-all validation fail() (EISDIR, etc.) unchanged. 2. Add a test in test/config.test.ts mirroring the existing chmodSync(0o000) + process.getuid guard pattern used in test/backlog-status-flow.test.ts, asserting loadConfig throws a denied LoreError with exitCodeFor === EXIT_CODES.denied when config.toml is unreadable. 3. Verify: bun test test/config.test.ts, bun run typecheck, full bun test suite, bun run lint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: bun test test/config.test.ts -> 37 pass, 0 fail (116 expect calls), including the new EACCES/EPERM test (3 expect calls executed, not skipped -- confirmed via -t filter, uid=501 non-root). bun run typecheck -> clean. Full bun test -> 1713 pass, 0 fail, 4780 expect calls across 45 files, no new failures vs baseline. bun run lint -> 0 errors (4 pre-existing infos in unrelated files: managed-block.test.ts, supersede.test.ts -- untouched by this change).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
readConfigText (src/config.ts) now maps EACCES/EPERM read failures to a denied LoreError (matching errors.ts's ioError/readFileIfPresent EACCES/EPERM->denied contract), instead of falling through to the generic validation fail(). ENOENT->undefined and the catch-all validation path (EISDIR, etc.) are unchanged. Added test/config.test.ts::'an unreadable (permission-denied) config.toml is a denied error, not validation (LCLI-108)', mirroring the existing chmodSync(0o000)+getuid guard pattern from test/backlog-status-flow.test.ts. Verified with bun test test/config.test.ts (37 pass), bun run typecheck (clean), full bun test (1713 pass/0 fail), bun run lint (0 errors).
<!-- SECTION:FINAL_SUMMARY:END -->
