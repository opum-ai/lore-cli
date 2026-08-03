---
id: LCLI-174
title: lore new default title-slug path bypasses reserved index/log stem policy
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - cmd-crud-a
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
modified_files:
  - src/commands/new.ts
  - test/new.test.ts
priority: medium
type: bug
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sibling of LCLI-114 (which fixed only the `--out` path). resolveDocPath() in src/commands/new.ts (lines ~290-299) routes the slugified-title path around resolveOutPath(), so a title that slugifies to a reserved stem — e.g. `lore new reference "Index"` -> docs/reference/index.md, or `lore new reference "Log"` -> docs/reference/log.md — is created with exit 0, never reaching the assertNotReservedStem() check LCLI-114 added on the --out path. This leaves `lore new` enforcing the reserved-stem policy on one entry path (--out) but not the other (default title slug), producing files that rename/supersede/link (which share assertNotReservedStem from src/commands/args.ts) will then refuse to touch. Found by the wave-1 integration review (2026-07-22); see doc-3 wave log.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `lore new <type> "Index"` and `lore new <type> "Log"` (default path, no --out) whose slugified basename is a reserved stem (index or log at any nesting depth) throw the same usage error assertNotReservedStem produces, instead of creating the file
- [x] #2 The docs-root index (docs/index.md) still fails with its existing RESERVED_ROOT_INDEX-specific message; the --out path behavior added in LCLI-114 is unchanged
- [x] #3 A regression test in test/new.test.ts covers a default-path (no --out) title that slugifies to index and one that slugifies to log, asserting runNew throws a usage error for both
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In resolveDocPath (src/commands/new.ts), after computing the conventional docs/<typeDirectory>/<slug>.md path, call the existing assertNotReservedStem(idFromPath(docPath), "create") guard (same one resolveOutPath already uses) before returning the path, so a title slugifying to 'index' or 'log' throws a usage error instead of writing the file. 2. No RESERVED_ROOT_INDEX check needed on this path: the default path always has a non-empty type-directory segment, so it can never equal docs/index.md. 3. Add a regression test in test/new.test.ts covering 'lore new reference "Index"' and 'lore new reference "Log"' (no --out), asserting a usage error with the assertNotReservedStem message and that no file is created. 4. Mutation-check: revert the source hunk, confirm the new test fails, restore.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: resolveDocPath() in src/commands/new.ts now calls assertNotReservedStem(idFromPath(docPath), "create") on the computed default (no --out) path before returning it, reusing the exact guard resolveOutPath already applies (LCLI-114) — no new reserved-stem logic, just closing the second entry path. Added a doc-comment explaining why no RESERVED_ROOT_INDEX check is needed on this path (type-directory segment is always non-empty).

Test: added a regression test in test/new.test.ts asserting 'lore new reference "Index"' and 'lore new reference "Log"' (default path, no --out) throw a usage error containing 'reserved, machine-generated file name' and that no file is created. Mutation-checked: reverted the source hunk (git stash), reran — test failed (expected a LoreError, but runNew returned; 51 pass/1 fail); restored the hunk (git stash pop) — test passes.

Verification: bun test test/new.test.ts = 52 pass/0 fail. Full suite: bun test = 1749 pass/0 fail across 46 files. bun run typecheck = clean (tsc --noEmit, no output). CLI repro against a freshly bun run src/cli.ts init'd scratch bundle: 'lore new reference "Index"' and 'lore new reference "Log"' both exit 2 with the reserved-stem usage error and create no file (AC#1); 'lore new reference "Home" --out docs/index.md' still gives the RESERVED_ROOT_INDEX-specific message, and 'lore new reference "Sub Home" --out docs/sub/index.md' still gives the assertNotReservedStem message unchanged from LCLI-114 (AC#2); a normal title ('Orders Table') still scaffolds successfully (sanity).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the default-path (no --out) entry to lore new that previously bypassed the reserved-stem policy: resolveDocPath() now applies the same assertNotReservedStem(idFromPath(docPath), "create") guard resolveOutPath already used since LCLI-114, so a title that slugifies to index or log (e.g. lore new reference "Index") throws a usage error instead of creating a file rename/supersede/link would then refuse to touch. The bundle-root index case is structurally unreachable on this path (type-directory segment is always non-empty), so no RESERVED_ROOT_INDEX check was needed there; the --out behavior is untouched.
<!-- SECTION:FINAL_SUMMARY:END -->
