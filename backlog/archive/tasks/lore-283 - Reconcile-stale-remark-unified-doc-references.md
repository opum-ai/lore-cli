---
id: LORE-283
title: Reconcile stale remark/unified doc references
status: Done
assignee: []
created_date: '2026-07-12 13:03'
updated_date: '2026-09-02 22:30'
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
- [x] #1 docs/ swept for remark/unified references and each classified accurate vs. stale
- [x] #2 stale references corrected to match current implementation
- [x] #3 lore check and lore validate clean after edits
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Duplicate of LORE-52 (same underlying task -- reconcile stale remark/unified doc references). Created 2026-07-12 by a session that lost track of the original LORE-52 (filed 2026-07-11) and refiled a less-complete version (missing the actual 8-file list LORE-52 already had). ID collision surfaced 2026-07-16 via 'backlog doctor'; repaired to this ID (LORE-53) via 'backlog doctor --fix --yes'. Archiving in favor of LORE-52, which has the complete/correct scope. See LORE-52 notes and LORE-14's /code-review notes (lines 79/82) for the verified 8-file list.

RENUMBERED AGAIN 2026-09-02: LORE-53 was itself later reused for a second, unrelated task
(`backlog/completed/lore-53 - Pin-lores-Backlog.md-dependency...md`, the real upstream --json
adoption work -- referenced by multiple real commits: f27f9ea, 17b4195, 9ba6359, cfdec4d,
01c5b67). That id is load-bearing for the OTHER task, not this one, so this file moves to
LORE-283 to end the second collision. This is the same archive/tasks/ next-id-counter gap
(the counter that assigned "53" here in 2026-07-16 never scanned archive/tasks/, so it later
handed "53" out again) that produced the LORE-195 collision found the same day -- see
docs/reference/backlog-to-quest-cutover-runbook.md (opum-agent) for the mechanism.

Also corrected while resolving the second collision: this file's own 2026-07-16 note already
established it as superseded by LORE-52, but its status/ACs were left as "To Do"/unchecked,
misrepresenting it as live open work. LORE-52 is confirmed Done; marked this Done and checked
its ACs to match, rather than leaving it looking open.
<!-- SECTION:NOTES:END -->
