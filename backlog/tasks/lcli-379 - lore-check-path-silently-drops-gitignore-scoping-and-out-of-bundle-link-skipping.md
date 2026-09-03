---
id: LCLI-379
title: >-
  lore check <path> silently drops gitignore scoping and out-of-bundle-link
  skipping
status: To Do
assignee: []
created_date: '2026-09-03 03:26'
labels:
  - bug
  - check
  - cli
dependencies: []
priority: high
ordinal: 506000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
opum-agent's release-gate investigation (2026-09-02) found that lore check with no argument and lore check . behave very differently from the same directory. From opum-doc's repo root: lore check (no arg) reports 134 files / 0 errors / 0 warnings / 92 out-of-bundle links skipped. lore check . reports 555 files / 14 errors / 567 warnings / 0 skipped, with 246 output lines referencing .herdr/, a gitignored 1.2 GB vendored toolchain the docs bundle does not own. Reproduced identically on installed 0.3.5 and on dev HEAD, so this is not a 0.4.0 regression -- it predates that release and has been latent for months. A docs gate that fails on files the project never wrote, purely because the invocation had an explicit path argument, is the same class of silent-wrong as LCLI-377: nobody notices until it fires. Two things to establish during investigation rather than assume: (1) the two symptoms (gitignore-aware scoping, and out-of-bundle-link skip count) may not share one cause -- treat them as two code paths until proven otherwise; (2) the correct behavior is a design question, not an obvious bug fix -- an explicit path argument could legitimately mean 'check exactly this directory, ignoring gitignore', in which case the defect is that lore does not say so (docs/help text), not that it scopes differently. Do not assume the fix is 'make the explicit-path case match the no-arg case' without deciding that question first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root cause identified and documented: which code path resolves the bundle root/file list for the no-arg case vs the case, and where gitignore-awareness and out-of-bundle-link-skip logic diverge between them
- [ ] #2 A decision is recorded on the task for what the correct behavior of an explicit path argument should be (match the no-arg path's gitignore-aware scoping, or intentionally check exactly the given path and document that loudly), before any code changes
- [ ] #3 Fix (or documentation fix, per the decision above) implemented and covered by a regression test reproducing the opum-doc symptom shape (a docs root containing a large gitignored non-bundle directory)
- [ ] #4 lore check . and lore check (no arg) run from the same directory against the same bundle report the same out-of-bundle-link skip count, or the CLI help text explicitly documents why they differ
<!-- AC:END -->
