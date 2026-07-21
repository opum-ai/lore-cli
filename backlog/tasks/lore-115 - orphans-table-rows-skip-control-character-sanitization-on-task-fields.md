---
id: LORE-115
title: orphans table rows skip control-character sanitization on task fields
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-crud-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
renderTaskSummaryRows() in src/output.ts (shared by `lore orphans` and `lore tasks`, per its own docstring) builds each row as `  ${row.id.padEnd(idWidth)}  ${row.status.padEnd(statusWidth)}  ${row.title}` directly from task id/status/title with no call to singleLine/asText or any other control-character stripping, unlike other renderers in the same file (e.g. the truncation-line renderers at output.ts:205 and :241) that do sanitize. orphans.ts:406 feeds orphanTasks straight into this function and emits the raw lines, so a task id, status, or title containing embedded newlines, carriage returns, or ANSI escape sequences (e.g. from a crafted/corrupted Backlog.md task file) is passed through verbatim into `lore orphans`' plain-mode output, violating the CLI's own ANSI-free/single-line plain-output guarantee.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 renderTaskSummaryRows() sanitizes each of row.id, row.status, and row.title with the same singleLine(asText(...)) treatment used elsewhere in output.ts before padding/joining, for both its `lore orphans` and `lore tasks` callers.
- [ ] #2 A task title (or id/status) containing an embedded newline or ANSI escape sequence no longer produces a multi-line or ANSI-containing row in `lore orphans` plain output; the row renders as a single sanitized line.
- [ ] #3 A regression test is added covering renderTaskSummaryRows with a row whose title contains a newline/control character, asserting the returned line is single-line and control-character-free.
<!-- AC:END -->
