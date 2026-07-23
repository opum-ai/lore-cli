---
id: LORE-208
title: Export InstructionsData and drop the duplicated test-side declaration
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 `InstructionsData` in `src/commands/instructions.ts` is declared with `export` (matching the export convention of every other command-result payload interface).
- [ ] #2 `test/instructions.test.ts` imports `InstructionsData` from `../src/commands/instructions` and no longer declares its own local copy of the interface.
- [ ] #3 `bun test test/instructions.test.ts` passes and the project typecheck (e.g. `bun run typecheck` / `tsc --noEmit`) reports no errors.
<!-- AC:END -->
