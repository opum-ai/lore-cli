---
id: LCLI-55.3
title: >-
  obsidian scaffold: never-silent-clobber preflight cannot detect a conflict on
  docs/ itself
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:15'
labels:
  - cmd
  - core
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - src/commands/scaffold.ts
parent_task_id: LCLI-55
priority: low
type: bug
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runScaffold's never-silent-clobber preflight (src/commands/scaffold.ts, the blockedDirs check) calls existsSync only on the full plan.dirs path, so for obsidian's nested "docs/.obsidian" it cannot detect a conflict sitting on the ancestor "docs" segment, unlike mkdocs/docusaurus's single-segment dirs. If docs is a plain file (not a directory) when a user runs `lore scaffold obsidian` without --force, the polished "obsidian config already exists ... pass --force to overwrite" preflight message never fires (existsSync on docs/.obsidian is false -- a path cannot traverse a non-directory parent). The command instead falls through to writeAllOrRollback and surfaces a lower-level conflict error that never names docs as the actual blocker and never mentions --force, unlike every other scaffold conflict message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The preflight check in runScaffold detects a non-directory occupying any ancestor segment of a planned nested directory (e.g. docs occupied by a plain file), not just the exact leaf path
- [x] #2 A new test reproduces docs as a plain file and asserts the friendly "already exists ... --force" conflict message fires for obsidian, matching docusaurus's existing "pre-existing non-directory file occupying website/" regression test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
The root cause is shared with LCLI-55.1: runScaffold's blockedDirs preflight (src/commands/scaffold.ts) already filters plan.dirs generically for a non-directory occupying each entry's path — it never needed a code change of its own. Once buildObsidianScaffold's dirs array explicitly lists 'docs' as its own entry (LCLI-55.1's fix), the SAME existing filter now checks 'docs' independently and catches a plain file sitting there, exactly matching core/scaffold.ts's own established convention (enumerate every ancestor level explicitly, rather than teach the preflight to walk ancestors dynamically). No further scaffold.ts change needed.
1. Verify (already true post-LCLI-55.1) that blockedDirs correctly flags 'docs' when it is a plain file.
2. Add a regression test mirroring docusaurus's 'pre-existing non-directory file occupying website/' test, adapted for obsidian's docs/ ancestor.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No scaffold.ts change was needed: LCLI-55.1's fix (adding DOCS_DIR to buildObsidianScaffold's dirs array) makes runScaffold's existing blockedDirs preflight filter over plan.dirs catch 'docs' as a non-directory automatically, since it's now its own explicit entry rather than only reachable via the unresolvable nested 'docs/.obsidian' path. Added test/consumer-scaffold.test.ts: 'a pre-existing non-directory file occupying docs/ is reported as a friendly conflict, not a deep crash (review #2)', mirroring docusaurus's own website/ regression test — verified passing in isolation and as part of the full 1496-test suite.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resolved as a direct consequence of LCLI-55.1's fix: once buildObsidianScaffold's dirs array explicitly lists 'docs' (not just the nested 'docs/.obsidian' leaf), runScaffold's existing blockedDirs preflight — which already generically filters plan.dirs for a non-directory occupying each entry — catches a plain file sitting at docs/ without any change to src/commands/scaffold.ts. Verified with a new regression test mirroring docusaurus's own 'pre-existing non-directory file occupying website/' case; full suite (1496 tests), typecheck, and lint all pass.
<!-- SECTION:FINAL_SUMMARY:END -->
