---
id: LORE-75
title: >-
  lore schema export --out can irreversibly delete unrelated files outside its
  own directory
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
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A full schema export prunes orphaned *.schema.json files from the resolved --out directory by filename suffix only, with no check that the directory is lore-owned. Running `lore schema export --out .` (or any directory that happens to contain unrelated *.schema.json files) silently and irreversibly deletes those files with no confirmation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pruneOrphans only deletes files inside a directory lore itself created/owns for schema export (e.g. requires a marker file, or restricts pruning to the default .lore/schemas/ path unless explicitly opted in)
- [ ] #2 Exporting to an arbitrary pre-existing directory containing unrelated *.schema.json files does not delete them, or requires an explicit opt-in flag with a warning
- [ ] #3 A test covers exporting into a directory with an unrelated *.schema.json file and asserts it survives
<!-- AC:END -->
