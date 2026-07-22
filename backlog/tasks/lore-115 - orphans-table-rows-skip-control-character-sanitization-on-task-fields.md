---
id: LORE-115
title: orphans table rows skip control-character sanitization on task fields
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 12:59'
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
- [x] #1 renderTaskSummaryRows() sanitizes each of row.id, row.status, and row.title with the same singleLine(asText(...)) treatment used elsewhere in output.ts before padding/joining, for both its `lore orphans` and `lore tasks` callers.
- [x] #2 A task title (or id/status) containing an embedded newline or ANSI escape sequence no longer produces a multi-line or ANSI-containing row in `lore orphans` plain output; the row renders as a single sanitized line.
- [x] #3 A regression test is added covering renderTaskSummaryRows with a row whose title contains a newline/control character, asserting the returned line is single-line and control-character-free.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In renderTaskSummaryRows() (src/output.ts), sanitize row.id/status/title via singleLine(asText(...)) (same treatment used elsewhere in this file, e.g. renderTruncationLine's hint) before computing column widths and before joining into the padded line, so both lore orphans and lore tasks (shared callers) emit single-line, control-char-free rows and column widths are measured against the same sanitized text that is printed. 2. Add a regression test in test/output.test.ts covering a row whose id/status/title contains an embedded newline/control character, asserting the returned line is single-line (no \n/\r) and matches the collapsed text.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sanitized renderTaskSummaryRows() in src/output.ts: id/status/title now go through singleLine(asText(...)) (matching the existing pattern used for the truncation-line hint) before column-width measurement and joining, so widths are computed against the same sanitized text that is printed. Shared by both lore tasks and lore orphans callers (single function, no per-caller change needed). Added a regression test in test/output.test.ts asserting a row with embedded newline/CR in id/status/title renders as one control-character-free line with the expected collapsed text. Verified: bun test test/output.test.ts (61 tests, 0 fail), bun run typecheck (clean), full bun test suite (1713 pass, 0 fail, no new failures).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
renderTaskSummaryRows() (src/output.ts) now sanitizes row.id/status/title via singleLine(asText(...)) before padding/joining, same treatment as the truncation-line hint renderer elsewhere in the file; widths are measured on the sanitized text so padding stays consistent with what is printed. Shared by lore tasks and lore orphans, so both benefit from one change. Verified: bun test test/output.test.ts (61 tests incl. new LORE-115 regression test, 0 fail), bun run typecheck (clean), full bun test suite (1713 pass, 0 fail, no new failures).
<!-- SECTION:FINAL_SUMMARY:END -->
