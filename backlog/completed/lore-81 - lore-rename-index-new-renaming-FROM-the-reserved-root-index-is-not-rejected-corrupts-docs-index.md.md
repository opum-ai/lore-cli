---
id: LORE-81
title: >-
  lore rename index <new> (renaming FROM the reserved root index) is not
  rejected, corrupts docs/index.md
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 17:50'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
assertNotReservedStem is only called on newId in commands/rename.ts, not oldId, unlike supersede.ts which checks both. Renaming FROM the reserved root index concept (docs/index.md, which does carry frontmatter and loads as a real graph concept) is not rejected up front. Tracing the actual write sequence: the regenerated index listing gets written to the source path, then immediately overwritten by the moved content, then the source is renamed away, leaving docs/index.md missing entirely after the command completes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore rename rejects oldId == index (the bundle root index) with a clear usage error, matching supersede.ts behavior
- [x] #2 A test covers `lore rename index <new-name>` and asserts it is rejected rather than leaving docs/index.md missing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed: added assertNotReservedStem(oldId, "rename from") in runRename (src/commands/rename.ts), mirroring supersede.ts's two-sided check. Live-CLI-verified the repro first on a scratch bundle: 'lore rename index some-new-name' exited 0 and left docs/index.md missing before the fix; after the fix it exits 2 (usage) with docs/index.md untouched. Added a regression test (test/rename.test.ts) covering AC#2. Confirmed a normal (non-reserved) rename still works. Full suite: 1657/1657 pass, typecheck clean, biome clean on changed files.

Independent review (general-purpose subagent, post-commit): verdict "solid fix, safe to merge" — check sits before any bundle load/write, ordering matches supersede.ts exactly, no regressions (81/81 rename tests pass), basename-based check correctly covers subdirectory index/log stems too (same code path already proven from the newId side). Two non-blocking test-coverage suggestions noted (oldId === "log" case, subdirectory index-as-oldId case) — both exercise the identical assertNotReservedStem/basename path already covered from the newId side, so left as-is; no blocking findings.
<!-- SECTION:NOTES:END -->
