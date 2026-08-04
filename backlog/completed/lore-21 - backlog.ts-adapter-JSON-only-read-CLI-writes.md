---
id: LORE-21
title: 'backlog.ts adapter: JSON-only read + CLI writes'
status: Done
assignee:
  - '@jeremy'
created_date: '2026-06-21 06:25'
updated_date: '2026-07-02 11:13'
labels:
  - core
  - adapter
milestone: m-3
dependencies:
  - LORE-4
documentation:
  - docs/reference/backlog-cli-contract.md
  - docs/reference/backlog-json-schema.md
  - docs/adr/0002-backlog-integration-json-only.md
priority: high
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read via --json and JSON.parse the envelope; capability probe + min-version (fail-loud); write via task create/edit; capture new id from the Created task line; existence via edit/list never view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Adapter never parses --plain text
- [x] #2 Probe refuses a non --json-capable Backlog
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend src/adapters/backlog.ts (the ONLY backlog subprocess seam) with the typed read/write surface ON TOP of the existing BacklogSpawn seam + probeBacklog (LORE-4). No second spawning module.
2. Promote the Zod contract mirror out of test/support/backlog-golden.ts into src/adapters/backlog.ts (schema of record); retarget the test mirror to import it (no duplicate).
3. Internal BacklogTask type (map from JSON data): id (identity), title, status (raw), priority, assignees, labels (carry doc:<id>), milestone, dependencies, references, documentation, file=filePathRelative (never absolute filePath), plus task-only optionals (AC/DoD by text not index, description, plan, notes, comments...). Summary subset for list/search.
4. Adapter factory createBacklogAdapter(spawn): caches probeBacklog once (AC#2 wired into read path); listTasks({status?,labels?}) -> task list --json (taskList); viewTask(id) -> task view <id> --json (task) returning null on EMPTY stdout (verified: missing id => exit 0, empty stdout, msg on stderr); searchByLabel/search -> search --json (searchResult, task hits only). Every read JSON.parses the {schemaVersion,kind,data} envelope, asserts schemaVersion+kind, Zod-validates data (loose: unknown keys tolerated, missing required rejected), maps to BacklogTask. NEVER --plain (AC#1).
5. Writes: createTask -> task create (NO --plain/--json), capture id from ^Created (?:task|draft) (\\S+)$ stdout line. editTask -> task edit --json (add/remove-label incremental, status). Existence via edit/list, never view.
6. Do NOT wire coupling commands into cli.ts (LORE-22+). Adapter layer only.
7. Unit-test via injected BacklogSpawn fake feeding committed test/fixtures/backlog-json/*.json goldens. Gates: typecheck, lint, bun test all-green, lore validate + lore check clean. Feature branch feat/lore-21-adapter -> PR into dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on feat/lore-21-adapter. Extended src/adapters/backlog.ts (the sole backlog subprocess seam) with the typed read/write surface ON TOP of the existing BacklogSpawn seam + probeBacklog (LORE-4) — no second spawning module.

Contract mirror PROMOTED into src/adapters/backlog.ts (schema of record): TaskSchema/TaskSummarySchema/SearchHitSchema/EnvelopeSchema + EnvelopeKind. test/support/backlog-golden.ts now RE-EXPORTS them (single source; golden test + recorder unchanged) — no duplicate copy.

Internal model: BacklogTask (summary subset) + BacklogTaskDetail (task view). Map bakes in schema §6 caveats — file = filePathRelative only (absolute filePath never surfaced), AC/DoD + comments drop the NON-durable positional index, id kept verbatim as identity.

Adapter: createBacklogAdapter(spawn) memoizes probeBacklog once (AC#2 wired into every path); listTasks({status?,labels?}) -> task list --json (taskList, --labels comma-joined per §2.4); viewTask(id) -> task view <id> --json (task), returns null on EMPTY stdout — VERIFIED against the fork (bun ~/repos/Backlog.md/src/cli.ts task view <missing> --json => exit 0, empty stdout, 'not found' on stderr; contract §2.2, never trust view exit code); searchTasks(query)/searchByLabel(label) -> search --json / task list --labels (task hits only, §5). Every read JSON.parses the {schemaVersion,kind,data} envelope, asserts schemaVersion+kind, Zod-validates data (loose: unknown keys tolerated, missing required rejected), maps to the internal type. Fail-loud (drift/validation, exit 6) — NEVER --plain (AC#1; ADR-0002, no text fallback).

Writes: createTask -> task create WITHOUT --plain/--json, id captured from ^Created (?:task|draft) (\S+)$ stdout line (§2.1); editTask -> task edit --json with incremental --add-label/--remove-label (comma-joined) + --status + --doc (accumulator); edit's exit code IS meaningful (§2.2) — missing (stderr /not found/) -> not_found (exit 3), other non-zero -> validation.

NOT wired into cli.ts dispatch — coupling commands are LORE-22+; this is the adapter layer only.

Gates GREEN: bun run typecheck clean; bun run lint clean (1 pre-existing info in supersede.test.ts, unrelated); bun test 1052 pass / 0 fail (was 1026 + 26 new adapter tests); src/adapters/backlog.ts 100% func + 100% line coverage; lore validate 0 errors; lore check 0 errors/0 warnings. Tests: test/backlog-adapter.test.ts drives the injected BacklogSpawn fake feeding the committed test/fixtures/backlog-json/*.json goldens.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
JSON-only backlog.ts adapter: typed reads (listTasks/viewTask/searchTasks/searchByLabel) that JSON.parse the {schemaVersion,kind,data} envelope and Zod-validate against the promoted contract mirror, plus CLI writes (createTask id-capture, editTask incremental patch), all over the existing injectable BacklogSpawn seam with the LORE-4 capability probe memoized into every path. AC#1 (never parses --plain) and AC#2 (probe refuses a non--json-capable Backlog) both met. Verified: 100% coverage on the adapter, 1052 tests pass, typecheck/lint/lore validate/lore check all clean. Delivered via feat/lore-21-adapter -> PR into dev.
<!-- SECTION:FINAL_SUMMARY:END -->
