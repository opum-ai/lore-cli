---
id: LCLI-187
title: >-
  Refresh two stale O_NOFOLLOW comments left by LCLI-130 (schema.ts + fswrite.ts
  ioError docstring)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - cmd-meta-c
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: bug
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from the wave-9 integration review of LCLI-130 (which replaced writeFileNoFollow's O_NOFOLLOW open + O_TRUNC overwrite with an up-front lstatSync refusal + temp-file + renameSync commit). The security guarantee is INTACT (verified: a pre-existing leaf symlink is still refused with the same conflict LoreError; a raced-in symlink cannot be written through because renameSync replaces the destination directory entry and never dereferences a destination symlink on POSIX) — this is PURELY comment inaccuracy, no behavior change. LCLI-130's own reviewer flagged both spots; they merged unfixed.

Two stale comments name a mechanism (O_NOFOLLOW open) that no longer exists:
1. src/commands/schema.ts:~115 — says "writeFileNoFollow's O_NOFOLLOW open refuses that". The refusal still happens (lstat + same conflict error); only the named mechanism is stale.
2. src/commands/fswrite.ts:~419-420 — ioError docstring says "a symlink an O_NOFOLLOW open refused to follow (ELOOP, see writeFileNoFollow)". Doubly stale: writeFileNoFollow no longer produces ELOOP for the leaf-symlink case (it throws its own LoreError before any open). The ELOOP branch itself is NOT dead (ELOOP can still arise from a symlink loop during path resolution in any fs call funneled through ioError) and its 'conflict' classification stays correct — only the provenance sentence is wrong.

Fix: reword both comments to describe the current lstat+rename mechanism (schema.ts) and drop/repoint the O_NOFOLLOW/ELOOP provenance claim in the ioError docstring (fswrite.ts) while keeping the ELOOP→conflict mapping. Comment-only; no code or test change expected (add a note if any assertion referenced the old wording).

The other O_NOFOLLOW mentions in fswrite.ts (~619/621/637/644) are deliberate historical notes in LCLI-130's new docstring — leave them. No docs/ hits.

Files: src/commands/schema.ts (~115), src/commands/fswrite.ts (~419-420). Conflicts (wave scheduling) with any fswrite.ts task (LCLI-120/130 done) or schema.ts task (LCLI-144/167/168/182).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/commands/schema.ts comment no longer references a non-existent O_NOFOLLOW open; it describes the current up-front lstat + rename-never-follows refusal accurately
- [x] #2 src/commands/fswrite.ts ioError docstring no longer attributes the ELOOP branch to writeFileNoFollow's (removed) O_NOFOLLOW open; the ELOOP→conflict classification is retained and correctly sourced (path-resolution symlink loop)
- [x] #3 No behavioral change; existing symlink-refusal tests still pass unmodified
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reword schema.ts ~line 115 comment to describe current lstat+rename refusal (no O_NOFOLLOW mention). 2. Reword fswrite.ts ioError docstring ~419-420 to repoint ELOOP provenance to path-resolution symlink loop, keeping ELOOP->conflict mapping. 3. Leave deliberate O_NOFOLLOW historical notes at ~619/621/637/644 untouched. 4. Run bun test + bun run typecheck as merge gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test -> 1900 pass, 0 fail (5353 expect() calls); bun run typecheck (tsc --noEmit) -> clean, no errors. bun run lint on changed files (schema.ts, fswrite.ts) -> no new findings. Symlink-refusal tests unmodified and still passing (AC#3).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reworded schema.ts:~115 comment to describe the current up-front lstatSync + temp-file/renameSync-never-follows refusal mechanism instead of the removed O_NOFOLLOW open. Reworded fswrite.ts ioError docstring (~419-420) to source the ELOOP branch from a path-resolution symlink loop rather than the removed writeFileNoFollow O_NOFOLLOW open, while retaining the ELOOP->conflict classification unchanged. Deliberate historical O_NOFOLLOW notes at fswrite.ts ~619/621/637/644 left untouched. Comment-only change; verified with full bun test suite (1900 pass, 0 fail) and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
