---
id: LORE-30
title: 'lore check: link/anchor + portability lint'
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
  - ci
milestone: m-4
dependencies:
  - LORE-28
documentation:
  - docs/adr/0007-validation-and-coherence.md
  - docs/reference/portable-markdown.md
priority: high
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Whole-bundle internal cross-link + heading-anchor validation (pure-JS remark-validate-links; internal by default; external opt-in via --external) plus portability lint (detection-only). No Rust/lychee runtime dep.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Anchor rot is detected across files
- [ ] #2 Wikilinks/embeds/callouts are flagged as warnings
<!-- AC:END -->
