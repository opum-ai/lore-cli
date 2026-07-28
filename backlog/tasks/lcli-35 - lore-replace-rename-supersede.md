---
id: LCLI-35
title: lore replace / rename / supersede
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:22'
labels:
  - cmd
milestone: m-4
dependencies:
  - LCLI-28
documentation:
  - docs/reference/cli-surface.md
priority: medium
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
replace: literal/regex find-replace across a doc or whole bundle (--in, --dry-run, --json), skipping lore-managed regions. rename/supersede: graph-aware rewrite of all inbound links + frontmatter refs (set superseded_by/supersedes/status).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 replace never touches managed regions
- [ ] #2 rename updates every inbound link and reference
<!-- AC:END -->
