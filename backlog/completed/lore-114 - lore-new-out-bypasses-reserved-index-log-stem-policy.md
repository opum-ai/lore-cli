---
id: LORE-114
title: lore new --out bypasses reserved index/log stem policy
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 12:28'
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
- [x] #1 `lore new <type> <title> --out docs/sub/index.md` and `--out docs/sub/log.md` (and any other nested path whose basename is `index` or `log`) now throw a `usage` error consistent with the message/hint produced by assertNotReservedStem, instead of creating the file.
- [x] #2 `docs/index.md` (the bundle-root index) still fails with the existing RESERVED_ROOT_INDEX-specific message, unaffected by the new check.
- [x] #3 A regression test is added to test/new.test.ts covering `--out` paths with a nested `index.md` and a `log.md` basename, asserting runNew throws a usage error for both.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a call to the shared assertNotReservedStem (src/commands/args.ts) in new.ts's resolveOutPath, after the existing RESERVED_ROOT_INDEX-specific check, on the extension-stripped id (idFromPath(posixRel)) so any nested index/log basename is rejected the same way rename/supersede/link already reject it. 2. Add a regression test in test/new.test.ts covering nested docs/sub/index.md and docs/sub/log.md via --out, asserting a usage error with the reserved-stem message and that no file is created. 3. Verify: bun test test/new.test.ts, bun run typecheck, full bun test suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: resolveOutPath() now calls the shared assertNotReservedStem(idFromPath(posixRel), "create") after the existing RESERVED_ROOT_INDEX check, so --out docs/.../index.md or .../log.md at any nesting depth throws the same usage error rename/supersede/link already produce. Root index docs/index.md still hits the earlier RESERVED_ROOT_INDEX-specific branch first, unaffected. Added regression test in test/new.test.ts for nested index.md and log.md basenames (asserts usage error + no file written). Verified: bun test test/new.test.ts -> 51 pass/0 fail; bun run typecheck -> clean; full bun test -> 1698 pass/0 fail (no new or pre-existing failures).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/commands/new.ts's resolveOutPath() now calls the shared assertNotReservedStem() from src/commands/args.ts (same helper rename/supersede/link use) on the extension-stripped --out path, after the existing docs/index.md-specific check. Any --out path whose basename is index or log, at any nesting depth, now throws a usage error consistent with rename/supersede/link. The root index docs/index.md keeps its existing RESERVED_ROOT_INDEX-specific message. Regression test added in test/new.test.ts for nested docs/sub/index.md and docs/sub/log.md. Verified with bun test test/new.test.ts (51 pass), bun run typecheck (clean), and full bun test (1698 pass / 0 fail).
<!-- SECTION:FINAL_SUMMARY:END -->
