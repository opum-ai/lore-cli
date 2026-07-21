---
id: LORE-76
title: 'lore scaffold --force writes follow symlinks, escaping the repo root'
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The scaffold preflight uses statSync (follows symlinks) rather than lstatSync, and the actual write path (fswrite.ts writeAllOrRollback) follows a symlinked ancestor directory or a symlinked final target under --force, writing generated content outside the repo. This is the same symlink-escape class the codebase already guards against on the read path (bundle.ts, replace.ts use lstatSync and skip symlinks) but the write paths have no equivalent guard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scaffold write operations detect a symlink at any ancestor of the target path or at the final target itself and refuse to write through it (lstatSync-based check, matching the read-path convention)
- [ ] #2 A test covers a symlinked ancestor directory and a symlinked final target under --force, both refused
<!-- AC:END -->
