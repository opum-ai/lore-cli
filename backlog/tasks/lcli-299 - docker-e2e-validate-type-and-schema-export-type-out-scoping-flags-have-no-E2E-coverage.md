---
id: LCLI-299
title: >-
  docker/e2e: validate --type and schema export --type/--out scoping flags have
  no E2E coverage
status: To Do
assignee: []
created_date: '2026-08-04 04:10'
updated_date: '2026-08-04 04:10'
labels:
  - e2e
  - testing
  - validate
  - schema
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
references:
  - docker/e2e/run-e2e.sh
  - src/commands/validate.ts
  - src/commands/schema.ts
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: medium
ordinal: 412000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Observed
A coverage sweep of docker/e2e/run-e2e.sh (post-0.1.0) found two read/output-scoping flags on the concept-inspection commands are never exercised against the real binary, even though the bare commands and other flag combinations on the same commands are well covered:

- `lore validate --type <T>` — only bare `lore validate`, path-scoped `lore validate <paths...>`, and `--strict` appear in the harness. The type-filter path (skip files whose type doesn't match) is untested.
- `lore schema export --type <T>` and `lore schema export --out <dir>` — only bare `lore schema export --json` appears (multiple times, always exporting every type to the default `.lore/schemas/` location). Single-type export and a custom output directory are untested.

## Why it matters
Both flags are part of the documented, `--help`-exposed contract (`lore help validate --json`, `lore help schema --json`) and are exactly the kind of real-filesystem/real-argument-parsing behavior this project's own precedent (LCLI-56, LCLI-66) treats as needing the real-binary gate rather than relying on unit tests alone.

## Direction (decide in plan)
Add small E2E assertions near the existing validate/schema-export phases: `lore validate --type <T>` on a mixed-type bundle only reports on files of that type; `lore schema export --type <T>` writes only that type's schema file; `lore schema export --out <dir>` writes into the custom directory instead of `.lore/schemas/`. Re-derive exact flag names/behavior from `lore help validate --json` / `lore help schema --json` and src/commands/validate.ts / src/commands/schema.ts at execution time rather than trusting this description.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore validate --type <T> on a mixed-type bundle reports only on files of that type, asserted E2E
- [ ] #2 lore schema export --type <T> writes only that type's schema file, asserted E2E
- [ ] #3 lore schema export --out <dir> writes schemas into the custom directory instead of the default .lore/schemas/, asserted E2E
- [ ] #4 The full harness runs green against the real pinned binary, and teardown is clean
<!-- AC:END -->
