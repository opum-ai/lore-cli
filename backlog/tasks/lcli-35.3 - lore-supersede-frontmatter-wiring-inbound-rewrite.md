---
id: LCLI-35.3
title: lore supersede (frontmatter wiring + inbound rewrite)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:22'
labels:
  - cmd
milestone: m-4
dependencies: []
documentation:
  - docs/reference/cli-surface.md
parent_task_id: LCLI-35
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mark old concept superseded by new and wire both ways (status: superseded, superseded_by/supersedes), preserving the old file; optionally repoint inbound links via the shared rewriteInbound engine (--rewrite-links). Reuses core/rewrite.ts from the rename subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 supersession frontmatter is wired both ways and round-trips byte-stably
- [x] #2 --rewrite-links repoints inbound links to the successor
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

Folded /code-review max (run wetd0dsjt; 41 agents, 15 CONFIRMED findings) in b895d1d. Cluster root cause: reusing rename's machinery on a file supersede never deletes. Key fixes — (1) --rewrite-links repoints inbound BODY links only (new engine option rewriteFrontmatterRefs:false); leaving third-party supersedes/superseded_by/specs refs intact (preserved old file ⇒ valid history, not dead pointers); (2) already-superseded guard now case-insensitive + blocks on any existing superseded_by (wireOld can't clobber a recorded successor); (3) reserved hubs (index/log) rejected as principals + excluded from rewrite via new engine  set; (4) serializeConcept runs under loadProfile() so a custom status enum fails fast vs breaking CI; (5) wireNew returns null on no-op append (no phantom write / filesChanged); rewroteLinks reflects actual outcome; (6) shared conceptNotInBundle factory in bundle.ts. Declined w/ rationale: #7 superseding-by-superseded records TRUE history / valid chain; #10/#11 arg-parser+report duplication across rename/replace/supersede is the accepted pattern from #22/#23, cross-command extraction is separate scope. Gates: 787 tests pass (39 supersede + 2 engine-option), biome/tsc clean, supersede.ts 100% func/99.5% line, core/rewrite.ts+bundle.ts 100% func. AC#1+AC#2 met. Ready for PR into dev.

Folded /code-review max (run wetd0dsjt; 41 agents, 15 CONFIRMED) in b895d1d. Root cause: reusing renames machinery on a file supersede never deletes. Fixes: (1) --rewrite-links repoints inbound BODY links only (new engine option rewriteFrontmatterRefs:false), leaving third-party supersedes/superseded_by/specs refs intact since the preserved old file makes them valid history not dead pointers; (2) already-superseded guard now case-insensitive and blocks on any existing superseded_by so wireOld cannot clobber a recorded successor; (3) reserved hubs index/log rejected as principals and excluded from rewrite via new engine exclude set; (4) serializeConcept runs under loadProfile so a custom status enum fails fast instead of breaking CI later; (5) wireNew returns null on a no-op append (no phantom write or filesChanged inflation); rewroteLinks reflects actual outcome; (6) shared conceptNotInBundle factory in bundle.ts. Declined: superseding-by-superseded records TRUE history / valid chain; arg-parser+report duplication across rename/replace/supersede is the accepted pattern from PRs 22/23, cross-command extraction is separate scope. Gates: 787 tests pass, biome/tsc clean, supersede.ts 100pct func, core 100pct func. AC1+AC2 met. Ready for PR.
<!-- SECTION:NOTES:END -->
