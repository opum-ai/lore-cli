---
id: LORE-174
title: lore new default title-slug path bypasses reserved index/log stem policy
status: To Do
assignee: []
created_date: '2026-07-22 12:49'
labels:
  - codex-review-followup
  - cmd-crud-a
dependencies: []
priority: medium
type: bug
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sibling of LORE-114 (which fixed only the `--out` path). resolveDocPath() in src/commands/new.ts (lines ~290-299) routes the slugified-title path around resolveOutPath(), so a title that slugifies to a reserved stem — e.g. `lore new reference "Index"` -> docs/reference/index.md, or `lore new reference "Log"` -> docs/reference/log.md — is created with exit 0, never reaching the assertNotReservedStem() check LORE-114 added on the --out path. This leaves `lore new` enforcing the reserved-stem policy on one entry path (--out) but not the other (default title slug), producing files that rename/supersede/link (which share assertNotReservedStem from src/commands/args.ts) will then refuse to touch. Found by the wave-1 integration review (2026-07-22); see doc-3 wave log.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `lore new <type> "Index"` and `lore new <type> "Log"` (default path, no --out) whose slugified basename is a reserved stem (index or log at any nesting depth) throw the same usage error assertNotReservedStem produces, instead of creating the file
- [ ] #2 The docs-root index (docs/index.md) still fails with its existing RESERVED_ROOT_INDEX-specific message; the --out path behavior added in LORE-114 is unchanged
- [ ] #3 A regression test in test/new.test.ts covers a default-path (no --out) title that slugifies to index and one that slugifies to log, asserting runNew throws a usage error for both
<!-- AC:END -->
