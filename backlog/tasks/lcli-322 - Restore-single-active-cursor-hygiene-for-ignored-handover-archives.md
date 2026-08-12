---
id: LCLI-322
title: Restore single-active-cursor hygiene for ignored handover archives
status: To Do
assignee: []
created_date: '2026-08-10 19:59'
updated_date: '2026-08-10 20:00'
labels:
  - handover
  - lifecycle
  - archive-hygiene
  - follow-up
  - 'doc:stories/maintain-lore-cli-documentation-authority'
dependencies: []
references:
  - >-
    backlog/tasks/lcli-293 -
    Reconcile-Lore-CLI-release-truth-handover-lifecycle-and-Story-ownership.md
modified_files:
  - .claude/handovers/
  - .codex/skills/backlog-handover/
priority: medium
type: chore
ordinal: 445000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore the handover lifecycle invariant established by LCLI-293. Live inspection on 2026-08-10 found 58 ignored Markdown files under .claude/handovers, with 27 carrying executable continue, paste-ready, or safe-resume cursor language. These local archives can misroute a future session even though the tracked archive was previously normalized. Reconcile the ignored handovers against live Git and Backlog state, preserve unique unfinished evidence, and add durable guardrails so obsolete cursors do not accumulate again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exactly one current ignored handover is designated as executable; every obsolete ignored handover is removed after safe-state verification or retained only as concise past-tense non-executable provenance
- [ ] #2 The current handover is re-grounded against live Git and Backlog state and contains no stale local-artifact path presented as available
- [ ] #3 A deterministic lifecycle audit distinguishes the active pointer from obsolete handovers and fails when more than one executable cursor, paste-ready prompt, or runnable resume sequence exists
- [ ] #4 Cleanup preserves unique unfinished campaign evidence, does not expose secrets or machine-specific paths in tracked history, and records the disposition of every removed or retained handover
<!-- AC:END -->
