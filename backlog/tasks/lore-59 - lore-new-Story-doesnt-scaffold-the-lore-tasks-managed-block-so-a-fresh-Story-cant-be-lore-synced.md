---
id: LORE-59
title: >-
  lore new Story doesn't scaffold the lore:tasks managed block, so a fresh Story
  can't be lore synced
status: To Do
assignee: []
created_date: '2026-07-19 15:00'
labels:
  - bug
  - template
  - managed-block
dependencies:
  - LORE-56
references:
  - src/core/template.ts
  - src/core/managed-block.ts
  - docs/runbooks/agent-onboarding.md
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/core/template.ts STORY_TEMPLATE contains no lore:tasks:begin/lore:tasks:end HTML-comment markers (just "# {{title}}" / "## Goal" / "## Acceptance criteria" / "## Notes"). Story is the one type carrying the tasks: coupling (docs/specs/lore-design.md section 6.2 calls the managed block "the sole region lore regenerates inside a Story"), and docs/runbooks/agent-onboarding.md documents the canonical loop as: lore new, then lore link, then lore sync, then lore check, working out of the box on a fresh Story. In reality that loop fails at the sync step on any freshly-created Story:

  lore new Story "Test"; lore link stories/test TASK-1; lore sync
  -> validation error, exit 6: cannot regenerate the lore:tasks block -- the managed
     task region is missing (need one begin-marker and one end-marker at the
     document top level)

Confirmed via a real dry run against a pinned upstream backlog binary (LORE-56). Neither lore new nor lore link inserts the markers, and lore sync (src/core/managed-block.ts) treats a totally-absent block as a hard validation error rather than something to create on first sync -- so a brand-new Story is not sync-able until a human manually adds the two marker lines by hand, which is nowhere documented as a required manual step; agent-onboarding.md reads as though the block is just always present.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Either STORY_TEMPLATE ships the managed-block markers by default, or lore sync creates the block on first sync when totally absent instead of erroring -- pick one and document the choice
- [ ] #2 The canonical loop in agent-onboarding.md (new, link, sync, check) succeeds end-to-end on a freshly-created Story with no manual markup step
- [ ] #3 A regression test covers a fresh lore new Story followed immediately by lore sync
<!-- AC:END -->
