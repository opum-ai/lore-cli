---
id: LORE-35.3
title: lore supersede (frontmatter wiring + inbound rewrite)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-28 05:18'
updated_date: '2026-06-28 13:15'
labels:
  - cmd
milestone: m-4
dependencies: []
documentation:
  - docs/reference/cli-surface.md
parent_task_id: LORE-35
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mark old concept superseded by new and wire both ways (status: superseded, superseded_by/supersedes), preserving the old file; optionally repoint inbound links via the shared rewriteInbound engine (--rewrite-links). Reuses core/rewrite.ts from the rename subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 supersession frontmatter is wired both ways and round-trips byte-stably
- [ ] #2 --rewrite-links repoints inbound links to the successor
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Branch feat/lore-35.3-supersede off dev.
2. Implement thin commands/supersede.ts: parse <oldId> <newId> [--rewrite-links] [--dry-run]; load bundle; validate both ids exist (not_found/3) + old not already superseded (conflict/5) + self-supersede (usage/2); wire OLD (status: superseded, superseded_by: newId) + NEW (append oldId to supersedes, scalar→list, no clobber/dup) via byte-stable serializeConcept; --rewrite-links reuses core/rewrite.ts rewriteInbound(move:false), EXCLUDING both principals; overwrite in place (no move/delete/index regen).
3. Register in cli.ts (USAGE + dispatch + import).
4. test/supersede.test.ts; CHANGELOG Added entry.
5. Gates (test/biome/tsc/coverage) → /code-review max → fold → PR into dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
First cut implemented + committed (62cceca on feat/lore-35.3-supersede). Design refinement vs the handover: BOTH principals (old AND new) are excluded from the rewriteInbound(move:false) writes, not merged. Rationale: the old doc is preserved history (its own self-links must not redirect to the successor), and the new doc legitimately links to its predecessor (redirecting old→new there would make the successor link to itself). So there is no body+frontmatter overlap to merge — principals get frontmatter-only wiring, third-party inbound files get the engine's body/ref rewrite. Gates green: 779 tests pass (28 new), biome clean, tsc clean, supersede.ts 100% func / 99.44% line, core/rewrite.ts 100% func. /code-review max running before PR.
<!-- SECTION:NOTES:END -->
