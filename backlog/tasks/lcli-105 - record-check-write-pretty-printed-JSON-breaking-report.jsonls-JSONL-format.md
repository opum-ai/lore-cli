---
id: LCLI-105
title: >-
  record()/check() write pretty-printed JSON, breaking report.jsonl's JSONL
  format
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - codex-review-followup
  - build-runtime
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
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
- [x] #1 record() and check() invoke `jq` with `-c` (or otherwise emit compact single-line JSON) when appending to `$REPORT`.
- [x] #2 After a run, every line in report.jsonl parses independently as a complete, standalone JSON object, and the number of lines in the file equals the number of recorded steps.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add -c to jq invocations in record() and check() in docker/e2e/run-e2e.sh so each appended report.jsonl entry is compact single-line JSON.
2. bash -n syntax check.
3. Isolated proof: source the functions in a subshell, call record()/check() a few times against a temp REPORT file, verify wc -l == call count and jq -c parses every line standalone.
4. Mark Done with evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed both jq invocations: record() (line ~47) and check() (line ~140) now use 'jq -nc' instead of 'jq -n', so each appended report.jsonl entry is compact single-line JSON. Only docker/e2e/run-e2e.sh touched, no other files.

Verified: (1) bash -n docker/e2e/run-e2e.sh -> syntax OK. (2) Isolated proof script extracted verbatim post-fix record()/check() bodies into a subshell, called record() 3x (incl. multi-line stdout/stderr, embedded quotes/backslashes/tabs) and check() 3x against a temp report.jsonl -> 6 calls produced exactly 6 lines (wc -l), every line parsed standalone via 'jq -ce .' (STANDALONE_OK=1), REPORT_WRITE_FAILURES=0 -> RESULT=PASS. (3) Sanity-checked the proof itself is discriminating: re-ran the identical script with 's/jq -nc/jq -n/' (reproducing the pre-fix bug) against the same 6 calls -> 36 lines, every line failed standalone parse -> RESULT=FAIL, confirming the harness detects the original defect and the fix resolves it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
record() and check() in docker/e2e/run-e2e.sh now invoke jq with -nc (compact) instead of -n, so every appended report.jsonl entry is exactly one line. Verified via bash -n (syntax OK) and an isolated proof harness that extracted the exact post-fix function bodies, exercised them 6x (3 record() incl. multi-line stdout/stderr and special chars, 3 check()) against a temp report file: line count == call count (6==6) and every line parsed standalone with jq -ce. A control run with the pre-fix (jq -n, no -c) pattern against the same calls reproduced the original bug (36 lines, all failing standalone parse), confirming the fix and the proof's validity.
<!-- SECTION:FINAL_SUMMARY:END -->
