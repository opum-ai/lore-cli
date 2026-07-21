---
id: LORE-114
title: lore new --out bypasses reserved index/log stem policy
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-crud-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveOutPath() in src/commands/new.ts (used by runNew via resolveDocPath) only rejects the literal root path `docs/index.md` (RESERVED_ROOT_INDEX); it never calls the shared assertNotReservedStem() from src/commands/args.ts that rename.ts, supersede.ts, and link.ts all use to reject a basename of `index` or `log` at any nesting depth. As a result, `lore new adr Title --out docs/sub/index.md` or `--out docs/sub/log.md` succeeds today and creates a machine-reserved file name via `lore new`, even though every other mutating command in the CLI blocks it. This lets a user create a doc that collides with lore's own generated index/log files, which the reserved-stem policy exists to prevent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `lore new <type> <title> --out docs/sub/index.md` and `--out docs/sub/log.md` (and any other nested path whose basename is `index` or `log`) now throw a `usage` error consistent with the message/hint produced by assertNotReservedStem, instead of creating the file.
- [ ] #2 `docs/index.md` (the bundle-root index) still fails with the existing RESERVED_ROOT_INDEX-specific message, unaffected by the new check.
- [ ] #3 A regression test is added to test/new.test.ts covering `--out` paths with a nested `index.md` and a `log.md` basename, asserting runNew throws a usage error for both.
<!-- AC:END -->
