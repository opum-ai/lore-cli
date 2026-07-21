---
id: LORE-105
title: >-
  record()/check() write pretty-printed JSON, breaking report.jsonl's JSONL
  format
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - build-runtime
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
run-e2e.sh:34's `record()` function (and the identical pattern in `check()` around line 127) appends to `$REPORT` using `jq -n ... >>"$REPORT"` without jq's `-c`/compact flag, so each call emits pretty-printed, multi-line JSON. Since the report file is named and documented as `report.jsonl` (one JSON object per line), every appended entry spanning multiple lines violates the JSON Lines format and breaks any tooling that parses the report line-by-line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 record() and check() invoke `jq` with `-c` (or otherwise emit compact single-line JSON) when appending to `$REPORT`.
- [ ] #2 After a run, every line in report.jsonl parses independently as a complete, standalone JSON object, and the number of lines in the file equals the number of recorded steps.
<!-- AC:END -->
