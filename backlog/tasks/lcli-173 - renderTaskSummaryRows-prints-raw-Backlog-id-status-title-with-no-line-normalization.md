---
id: LCLI-173
title: >-
  renderTaskSummaryRows prints raw Backlog id/status/title with no line
  normalization
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - errors-output-git
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
renderTaskSummaryRows (src/output.ts:403-407) interpolates `row.id`, `row.status`, and `row.title` directly into each output line with no `singleLine()` or control-character stripping. Since these fields originate from Backlog task data rather than lore-controlled input, a task title containing an embedded newline or control character breaks the aligned-column, one-row-per-line table format shared by `lore tasks` and `lore orphans`, corrupting the rendered output.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A TaskSummaryRow with a title containing an embedded newline or control character renders as a single, correctly-aligned output line from renderTaskSummaryRows, verified by a new test in test/output.test.ts.
- [ ] #2 renderTaskSummaryRows applies single-line normalization to id/status/title before formatting each row.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Resolved-by-merge by LCLI-115 (PR #103, wave 2). Verified against merged dev: renderTaskSummaryRows in src/output.ts now applies stripAnsiAndControls(singleLine(asText(...))) to id/status/title before column-width measurement and joining (AC#2). test/output.test.ts (added by LCLI-115) covers a row whose title contains a newline/control char, asserting a single correctly-aligned control-char-free line (AC#1). No separate code change needed.
<!-- SECTION:NOTES:END -->
