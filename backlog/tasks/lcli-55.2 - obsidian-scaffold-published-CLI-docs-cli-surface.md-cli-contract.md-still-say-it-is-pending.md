---
id: LCLI-55.2
title: >-
  obsidian scaffold: published CLI docs (cli-surface.md / cli-contract.md) still
  say it is pending
status: Done
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:15'
labels:
  - docs
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
documentation:
  - docs/reference/cli-surface.md
  - docs/reference/cli-contract.md
parent_task_id: LCLI-55
priority: medium
type: docs
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
commands/scaffold.ts's own module docstring now declares obsidian fully implemented (LCLI-41 shipped), but the canonical CLI reference docs it cites as authority still contradict this: docs/reference/cli-surface.md says "obsidian (pending, LCLI-41)" and "a target with no builder yet (obsidian) is a usage error"; docs/reference/cli-contract.md's kind registry says "docusaurus/obsidian pending". A user or agent reading either doc before running `lore scaffold obsidian` is told to expect a usage error (exit 2), but the command now exits 0 and writes docs/.obsidian/app.json -- shipped code and shipped documentation disagree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cli-surface.md's Consumer scaffolding section lists obsidian as implemented, not pending, matching mkdocs/docusaurus's phrasing
- [x] #2 cli-contract.md's scaffold.result kind registry no longer lists obsidian as pending
- [x] #3 Updated via the lore CLI (not hand-edited), and lore check / lore validate stay clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Via 'lore replace' (not hand-edit): flip cli-surface.md's obsidian bullet from (pending, LCLI-41) to (shipped, LCLI-41), matching mkdocs/docusaurus's phrasing.
2. Via 'lore replace': rewrite the 'A target with no builder yet (obsidian) is a usage error' sentence, which is now false, to the general 'An unrecognized target string is a usage error' claim that stays true regardless of which targets are implemented.
3. Via 'lore replace': fix cli-contract.md's scaffold.result registry row, which said 'docusaurus/obsidian pending' — also stale for docusaurus (shipped as LCLI-40) independent of this PR — to 'mkdocs, docusaurus, obsidian all shipped'.
4. Run 'lore check' to confirm the bundle stays clean (AC#3).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All edits applied via 'lore replace --in <file>' per repo convention (never hand-edited). While fixing cli-contract.md's scaffold.result row (AC#2), also corrected 'docusaurus ... pending' in the same clause — that was already stale independent of LCLI-41 (docusaurus shipped as LCLI-40 per cli-surface.md's own status), and leaving it wrong right next to the obsidian fix would have been an obviously incomplete edit to the same sentence; flagging this pre-existing drift in case broader cli-contract.md accuracy needs its own pass. 'lore check' reports 37 files, 0 errors, 0 warnings (exit 0) after the change; git diff confirms only the two targeted doc files changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated docs/reference/cli-surface.md (obsidian bullet: pending -> shipped, LCLI-41; removed the now-false 'no builder yet' claim) and docs/reference/cli-contract.md (scaffold.result registry row: mkdocs/docusaurus/obsidian all shipped), both via 'lore replace' per repo convention. Verified with 'lore check' (37 files, 0 errors, 0 warnings, exit 0) and a clean git diff scoped to exactly the two doc files.
<!-- SECTION:FINAL_SUMMARY:END -->
