---
id: LORE-228
title: >-
  replace.ts / validate.ts: reject an inline =value on boolean flags (--regex,
  --dry-run, --strict)
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-crud-a
  - codex-review-followup
  - cli-args
dependencies: []
priority: low
type: bug
ordinal: 330000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** A boolean CLI flag given an inline value (`--regex=false`, `--dry-run=false`, `--strict=false`) must be a `usage` error, not silently treated as the flag set true.

**Live state:** In `parseReplaceArgs` (src/commands/replace.ts) the flag name is split on `=` (replace.ts:182-183) and the switch sets `regex = true` (replace.ts:196-197) / `dryRun = true` (replace.ts:199-200) on a name match without inspecting the inline value. So `--regex=false` enables regex mode and `--dry-run=false` still enables dry-run. The `--regex=false` case is the sharp edge: a user typing it to *disable* regex actually enables it, and because the run is not a dry-run, potentially-wrong bulk replacements are written to disk. The identical defect exists in `parseValidateArgs` for `--strict` (src/commands/validate.ts:122-123).

**Why it's a defect (and the established fix):** The correct rejection pattern is already in the codebase and should be mirrored: orphans.ts rejects an inline value on its boolean flags with `if (inline !== undefined) throw usage("--tasks-only takes no value", …)` (src/commands/orphans.ts:282-284, 290-292), and graph.ts does the same for `--dot` (src/commands/graph.ts:127-129). The shared `parseCommandArgs` tokenizer (src/commands/args.ts:40-46) likewise never binds a value to a boolean flag. replace.ts and validate.ts are the two bespoke parsers the campaign left with this gap.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster cmd-crud-a. Round-3 re-audit confirmed the defect is still live on dev; note the `--regex=false` variant carries a data-write risk that a reviewer may choose to bump above Low.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In replace.ts, passing an inline value to `--regex` or `--dry-run` (e.g. `--regex=false`, `--dry-run=anything`) throws a `usage` LoreError (exit 2) such as "--regex takes no value" / "--dry-run takes no value", mirroring orphans.ts/graph.ts; the bare `--regex` and `--dry-run` forms still set their flags.
- [ ] #2 In validate.ts, passing an inline value to `--strict` throws the analogous `usage` error; bare `--strict` is unchanged.
- [ ] #3 Tests assert `lore replace --regex=false <find> <replace>`, `lore replace --dry-run=false <find> <replace>`, and `lore validate --strict=false` each exit 2 with a usage error, and that the bare boolean forms still work.
- [ ] #4 orphans.ts and graph.ts (already correct) and the shared args.ts tokenizer are left unchanged; the full test suite passes.
<!-- AC:END -->
