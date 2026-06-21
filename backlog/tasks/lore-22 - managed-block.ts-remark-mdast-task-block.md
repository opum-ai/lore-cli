---
id: LORE-22
title: 'managed-block.ts: remark/mdast task block'
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 06:28'
labels:
  - core
milestone: m-3
dependencies:
  - LORE-21
documentation:
  - docs/adr/0008-managed-block-remark-ast.md
priority: high
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Regenerate the lore:tasks region via mdast; byte-identical on no change; build links from JSON filePathRelative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No upstream change yields a byte-identical block
- [ ] #2 Links resolve to the correct backlog task files
<!-- AC:END -->
