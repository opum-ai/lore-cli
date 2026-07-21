---
id: LORE-77
title: >-
  lore init follows pre-existing symlinks at scaffold paths, escaping the repo
  root
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
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
If docs/ or .lore/ already exists as a symlink to an external location when `lore init` runs, ensureDir recursive mkdirSync and createIfAbsent wx writes both traverse the symlink and create scaffold files at that external target instead of inside the repo. Reproduced directly against a pre-existing docs -> /outside symlink.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore init detects a pre-existing symlink at docs, .lore, or .lore/schemas and refuses to scaffold through it with a clear error
- [ ] #2 A test covers a symlinked scaffold path and asserts init refuses rather than writing through it
<!-- AC:END -->
