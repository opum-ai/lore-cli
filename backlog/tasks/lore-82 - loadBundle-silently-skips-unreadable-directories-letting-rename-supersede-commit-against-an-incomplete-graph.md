---
id: LORE-82
title: >-
  loadBundle silently skips unreadable directories, letting rename/supersede
  commit against an incomplete graph
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a nested bundle directory loses read permission, loadBundle skips it during the walk with only an advisory warning. Mutation commands (rename, supersede) commit unconditionally regardless of that warning, so any inbound link from a concept inside the skipped directory is never rewritten, and the command still reports success while leaving stale/broken links behind.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A mutation command (rename, supersede) refuses to commit when loadBundle reported any skipped/unreadable directory, surfacing a clear error instead of silently proceeding
- [ ] #2 A test covers an unreadable nested directory during a rename and asserts the command fails loudly rather than committing a partial rewrite
<!-- AC:END -->
