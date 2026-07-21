---
id: LORE-108
title: >-
  readConfigText maps EACCES/EPERM config read failures to 'validation' not
  'denied'
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 When readFileSync on the config path fails with EACCES or EPERM, readConfigText raises a LoreError with type `denied` (matching the codebase's shared EACCES/EPERM → denied contract), not `validation`.
- [ ] #2 A new test in test/config.test.ts simulates an EACCES/EPERM failure reading the config file and asserts the resulting error's `type` is `denied` with an exit code matching EXIT_CODES.denied.
- [ ] #3 The existing ENOENT (missing file → undefined/default config) behavior is unchanged.
<!-- AC:END -->
