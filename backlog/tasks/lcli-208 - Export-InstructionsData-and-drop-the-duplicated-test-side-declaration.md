---
id: LCLI-208
title: Export InstructionsData and drop the duplicated test-side declaration
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:28'
labels:
  - cmd-meta-d
  - codex-review-followup
  - consistency
dependencies: []
priority: low
type: chore
ordinal: 310000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `InstructionsData` becomes an exported type and `test/instructions.test.ts` imports it instead of re-declaring it.

**Why:** `InstructionsData` at `src/commands/instructions.ts:32` is the sole command-defined result-payload interface that is not exported. Every sibling payload is exported — `InitResult` (`src/commands/init.ts:26`), `NewResult` (`src/commands/new.ts:47`), `ReplaceReport` (`src/commands/replace.ts:93`), `SchemaExportResult` (`src/commands/schema.ts:67`), `ScaffoldResult` (`src/commands/scaffold.ts:58`), `SupersedeReport` (`src/commands/supersede.ts:87`), `OrphansReport` (`src/commands/orphans.ts:125`), `RenameReport` (`src/commands/rename.ts:98`), `AgentsResult` (`src/commands/agents.ts:37`), `SyncReport` (`src/commands/sync.ts:115`), `LinkReport`/`UnlinkReport` (`src/commands/link.ts:116`/`140`), `TaskRollup` (`src/commands/tasks.ts:74`). Because the source type is not importable, `test/instructions.test.ts:11-16` re-declares an identical `interface InstructionsData { topic; title; body; topics }` — a DRY violation that will drift silently if the payload shape changes on one side only.

**Live context:** the interface is declared at `src/commands/instructions.ts:32` and consumed only within that file (`instructionsRenderable`, `render`, `renderPretty`, `renderPlain`) plus the duplicate at `test/instructions.test.ts:11`.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity findings, cluster cmd-meta-d.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `InstructionsData` in `src/commands/instructions.ts` is declared with `export` (matching the export convention of every other command-result payload interface).
- [x] #2 `test/instructions.test.ts` imports `InstructionsData` from `../src/commands/instructions` and no longer declares its own local copy of the interface.
- [x] #3 `bun test test/instructions.test.ts` passes and the project typecheck (e.g. `bun run typecheck` / `tsc --noEmit`) reports no errors.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add export to InstructionsData interface in src/commands/instructions.ts. 2. Remove duplicated local interface in test/instructions.test.ts and import InstructionsData from ../src/commands/instructions instead. 3. Verify with bun test test/instructions.test.ts, full bun test, and bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added export to InstructionsData in src/commands/instructions.ts:32. Removed duplicated local interface in test/instructions.test.ts and replaced with 'import { type InstructionsData, type InstructionsOptions, runInstructions } from ...' matching the file's existing inline-type-import style. Verified: bun test test/instructions.test.ts -> 16 pass, 0 fail; full bun test -> 1913 pass, 0 fail; bun run typecheck (tsc --noEmit) -> clean, no errors.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Exported InstructionsData from src/commands/instructions.ts to match every sibling command-result payload interface, and updated test/instructions.test.ts to import it instead of re-declaring a duplicate local interface. No behavior change. Verified with bun test test/instructions.test.ts (16 pass/0 fail), full bun test (1913 pass/0 fail), and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
