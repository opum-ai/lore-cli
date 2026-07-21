---
id: LORE-73
title: 'lore replace can corrupt lore:tasks managed blocks (MANAGED_MARKERS gap)'
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
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
core/replace.ts MANAGED_MARKERS only lists the lore:index begin/end markers. The lore:tasks managed-block markers that managed-block.ts (LORE-22) added after replace.ts shipped were never wired into this registry, so `lore replace` edits and counts matches inside a live task table, directly contradicting the documented "skips lore-managed regions" guarantee. Reproduced directly: replacing text inside a well-formed lore:tasks block edits the machine-owned row instead of skipping it. A subsequent `lore sync` will clobber the corrupted table. Found independently from two review angles (reading core/replace.ts directly, and reading commands/replace.ts which calls it) — same registry, same fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MANAGED_MARKERS in core/replace.ts includes the lore:tasks begin/end marker pair alongside lore:index
- [ ] #2 lore replace leaves matches inside a lore:tasks managed block untouched and uncounted, matching its documented behavior for lore:index blocks
- [ ] #3 A regression test covers a match located inside a lore:tasks block and asserts it is skipped
<!-- AC:END -->
