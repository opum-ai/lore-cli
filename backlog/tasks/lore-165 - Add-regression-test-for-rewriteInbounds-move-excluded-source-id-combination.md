---
id: LORE-165
title: Add regression test for rewriteInbound's move + excluded-source-id combination
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-rewrite-engine
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
test/rename.test.ts previously lacked coverage for three scenarios: escaped-bracket reference labels, an id that escapes the bundle root, and a move combined with an excluded source id. The first two are now covered (lines 95-105 and 372-482 respectively), but the existing exclude test block (lines 336-349) only exercises move:false, so the exact move:true + exclude-contains-source-id scenario — the same combination behind the open rewrite.ts:197/225-229 finding — remains untested. Without this coverage, a regression in how exclude interacts with move (e.g. plan.rename set with no corresponding write) would not be caught by the test suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 test/rename.test.ts contains a test that calls rewriteInbound with move:true and exclude:new Set([<source id>]), and asserts on the shape of the returned plan's `rename` and `writes` fields together (not merely that the excluded id's file is skipped).
- [ ] #2 The new test is written so it fails against the current, unfixed rewriteInbound behavior (rename set with no matching write for the destination path) and passes once that inconsistency is corrected.
<!-- AC:END -->
