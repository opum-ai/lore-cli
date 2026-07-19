---
id: LORE-67
title: >-
  cli-surface.md documents behavior that does not exist: init
  --force/probe/exit-5, new type shorthands, check --fix, replace exit-6 gate;
  plus two dead validate config knobs
status: To Do
assignee: []
created_date: '2026-07-19 23:00'
labels:
  - docs
  - bug
  - cli-contract
dependencies: []
references:
  - docs/reference/cli-surface.md
  - src/commands/init.ts
  - src/core/config.ts
priority: low
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The docker/e2e coverage audit (2026-07-19, dev @ b8a4667) cross-checked docs/reference/cli-surface.md against the actual source and found four documented behaviors that DO NOT EXIST in the code (each verified directly against src/, not inferred), plus two dead-but-documented config knobs. These are docs bugs — the harness correctly tests reality and should not be changed to match the docs:

1. **init**: cli-surface.md:70-86 documents a --force flag, an exit-5 "already initialized" path, and a startup Backlog capability probe. src/commands/init.ts has none of these (verified: no flag parsing, no probe, only EXIT_OK; a re-run is documented in-code as idempotent exit 0 with a skipped list).
2. **new**: documented --epic/--story/--resource type shorthands do not exist.
3. **check**: a documented --fix flag does not exist.
4. **replace**: a documented exit-6 gate does not exist (replace has no validation gate path).

Also found (src/core/config.ts:65-70): two documented validate knobs are parsed by the config loader but have ZERO consumers anywhere in the code — dead-but-documented. Resolve per AC #5: either wire them up or remove them from the docs (doc-side fix expected per the audit; treat as an implementation choice and document it).

Fix doc-side via the lore CLI conventions (this repo dogfoods lore for docs/ — see the lore skill / lore instructions). Re-verify each claim against current source at execution time before editing: any of these could have been implemented between task creation and pickup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The init section matches src/commands/init.ts: no --force, no exit-5 already-initialized, no probe claims; the documented idempotent re-run behavior matches the code
- [ ] #2 The new section drops the --epic/--story/--resource shorthand claims
- [ ] #3 The check section drops --fix and the replace section drops the exit-6 gate claim
- [ ] #4 Every removed claim is re-verified against current source at execution time before editing (none were implemented in the interim)
- [ ] #5 The two documented-but-unconsumed validate config knobs are resolved: wired up or removed from the docs, with the choice documented
<!-- AC:END -->
