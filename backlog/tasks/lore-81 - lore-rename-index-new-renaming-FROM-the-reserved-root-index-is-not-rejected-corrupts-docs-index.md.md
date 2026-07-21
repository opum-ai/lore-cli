---
id: LORE-81
title: >-
  lore rename index <new> (renaming FROM the reserved root index) is not
  rejected, corrupts docs/index.md
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
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
assertNotReservedStem is only called on newId in commands/rename.ts, not oldId, unlike supersede.ts which checks both. Renaming FROM the reserved root index concept (docs/index.md, which does carry frontmatter and loads as a real graph concept) is not rejected up front. Tracing the actual write sequence: the regenerated index listing gets written to the source path, then immediately overwritten by the moved content, then the source is renamed away, leaving docs/index.md missing entirely after the command completes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore rename rejects oldId == index (the bundle root index) with a clear usage error, matching supersede.ts behavior
- [ ] #2 A test covers `lore rename index <new-name>` and asserts it is rejected rather than leaving docs/index.md missing
<!-- AC:END -->
