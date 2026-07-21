---
id: LORE-69
title: commitBacklogFiles backlog/ scope guard does not block `..` pathspec traversal
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
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The backlog/ containment guard in commitBacklogFiles is a plain `startsWith("backlog/")` string check, not real path containment. A pathspec like `backlog/../docs/secret.md` passes the guard and git resolves/commits/stages it outside backlog/, breaking the sole-committer invariant recorded in ADR-0012. Confirmed live against real git (`git add -- ':(literal)backlog/../docs/secret.md'` resolves and commits the outside file).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 commitBacklogFiles rejects any candidate path whose resolved (normalized) form falls outside backlog/, not just ones failing a string-prefix check
- [ ] #2 A regression test exercises a `..`-containing path and asserts it is rejected rather than committed
- [ ] #3 The guard doc comment accurately describes what is defended against
<!-- AC:END -->
