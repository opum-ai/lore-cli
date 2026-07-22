---
id: LORE-186
title: >-
  linkText in indexes.ts must double pre-existing backslashes before inserting
  bracket escapes (parity with LORE-154's cell())
status: To Do
assignee: []
created_date: '2026-07-22 20:49'
labels:
  - codex-review-followup
  - core-index-context
dependencies: []
priority: medium
type: bug
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from the wave-9 integration review (LORE-154 hardened src/core/managed-block.ts cell()/escapeLinkText to double literal backslashes BEFORE inserting its own escapes, so an inserted escape can't combine with a source backslash). The sibling escaper linkText in src/core/indexes.ts (~lines 194-199) — which cell()'s own docstring cites as a 'matches' reference — was NOT updated and now has the exact hazard LORE-154 fixed:

linkText inserts CommonMark bracket escapes \[ / \] WITHOUT first doubling pre-existing backslashes. A concept title like 'a\[b' yields 'a\\[b' = an escaped backslash followed by a LIVE '[', which can unbalance / break the generated '- [text](link)' index entry (or spill following text out of the link).

This is a pre-existing latent bug that the wave turned into documented drift (the two escapers now cross-reference each other but differ in defensive posture). Not a wave-9 regression.

Fix: apply the same backslash-first doubling to linkText that cell()/escapeLinkText use (double '\' before inserting '\['/'\]'), and add a regression test for a title containing a backslash-bracket sequence (e.g. 'a\[b') asserting the generated index entry stays well-formed. Consider extracting ONE shared bracket/backslash escaper so the two can't drift again (mirrors the consolidation theme of LORE-185).

Files: src/core/indexes.ts (linkText ~194-199), cross-ref src/core/managed-block.ts (cell/escapeLinkText ~322-333). Conflicts (wave scheduling) with core-index-context tasks (LORE-149/150/162-area indexes.ts) and core-managed-template (LORE-154 done / 155/156).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 linkText doubles pre-existing backslashes before inserting bracket escapes, so a title containing a backslash-bracket sequence produces a well-formed markdown link in generated indexes (no live/unbalanced bracket)
- [ ] #2 Regression test covers a title like 'a\[b' (and a trailing-backslash title) through the real index generation path, asserting the '- [text](link)' entry stays balanced
- [ ] #3 Behavior matches LORE-154's cell()/escapeLinkText discipline (backslash-doubling first); ideally via one shared escaper so they can't diverge again
<!-- AC:END -->
