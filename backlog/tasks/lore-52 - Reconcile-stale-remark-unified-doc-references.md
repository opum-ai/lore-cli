---
id: LORE-52
title: Reconcile stale remark/unified doc references
status: To Do
assignee: []
created_date: '2026-07-12 13:03'
labels:
  - docs
dependencies: []
priority: low
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A prior session (LORE-9/LORE-14 work) flagged that several ADRs/specs contain doc references to the remark/unified markdown-processing stack that may be stale relative to the current implementation, but the exact file list from that session was not preserved before this task was filed. First step on pickup: a fresh repo-wide sweep of docs/ (grep remark/unified) to classify each hit as accurate vs. stale, since the actual implementation (LORE-22 managed-block.ts, LORE-8 core parsing) is the source of truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/ swept for remark/unified references and each classified accurate vs. stale
- [ ] #2 stale references corrected to match current implementation
- [ ] #3 lore check and lore validate clean after edits
<!-- AC:END -->
