---
id: LORE-2
title: Implement shared task-json serializer and --json on read commands
status: Done
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-07-01 19:12'
labels:
  - backlog-fork
milestone: m-0
dependencies:
  - LORE-1
documentation:
  - docs/reference/backlog-json-schema.md
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add src/formatters/task-json.ts and a per-command --json flag (json-before-plain) to task list, task view (+ task id), and search. Normalize lastModified to ISO string; omit rawContent by default.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 task list/view/search --json emit the canonical schemaVersion/kind/data envelope
- [x] #2 No icons in status; filePath present; AC/DoD indices documented as non-durable
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered in the fork (jeremy-newhouse/Backlog.md) on branch tasks/back-510-json-output, commit 28e0755 (BACK-510 - Add --json output to read commands). New src/formatters/task-json.ts provides serializeTask (kind=task), serializeTaskSummary (list/search subset), and a search-hit wrapper, all wrapped in the { schemaVersion:'1', kind, data } envelope. cli.ts gains jsonFlagInArgv/isJsonRequested/emitJson plus .option('--json') and a json-before-plain early-return on task list, task view, bare task <id>, and search (the ordering is the load-bearing correctness detail: --json must beat shouldAutoPlain on a non-TTY pipe). Serializer omits rawContent and lastModified, renames assignee->assignees, maps AC/DoD to {index,text,checked} with index documented non-durable, and emits both filePath and portable filePathRelative. New src/test/cli-json-output.test.ts (7 tests, incl. the mandatory non-TTY pipe guard) all green. Green gate on internal-disk build not required for LORE-2: biome check clean, tsc 0 errors, full fork suite 1341 pass / 1 pre-existing unrelated fail (cli-doc-search 'Query is required' error-message drift, fails on baseline too). --plain output unchanged (additive). NOTE: ~/repos/Backlog.md is a SYMLINK to /Volumes/external/repos/Backlog.md (external volume) — so 'bun build --compile' would silent-fail here; that compiled-binary step is LORE-3/LORE-4, not LORE-2.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added shared task-json serializer + per-command --json (json-before-plain) to Backlog.md fork read commands (task list/view/<id>/search), emitting the canonical {schemaVersion,kind,data} envelope. Verified: biome clean, tsc 0 errors, 7 new json tests + full fork suite green (1 pre-existing unrelated fail). Delivered as fork commit 28e0755 on tasks/back-510-json-output; no upstream PR (LORE-5 parked).
<!-- SECTION:FINAL_SUMMARY:END -->
