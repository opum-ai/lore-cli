---
id: LORE-262
title: >-
  lore supersede/rename --rewrite-links silently retargets a link whose display
  TEXT names the old id, leaving text/target mismatched
status: To Do
assignee: []
created_date: '2026-07-25 02:08'
labels:
  - cli-ux
  - core-rewrite-engine
dependencies: []
references:
  - src/core/rewrite.ts
  - src/commands/supersede.ts
priority: low
type: bug
ordinal: 364000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
When 'lore supersede <old> <new> --rewrite-links' (and, via the shared engine, 'lore rename') repoints inbound links, it must not silently leave a link whose DISPLAY TEXT deliberately names the old concept pointing at the new one — producing a doc that reads one thing and links another.

## Observed (Meridian stress test)
'lore supersede --rewrite-links' rewrote EVERY inbound link indiscriminately, including one whose surrounding prose intentionally named the OLD ADR for contrast against the new one (e.g. text 'ADR-0005' explaining why it was replaced). The rewrite left the visible text saying 'ADR-0005' while the link now pointed at ADR-0006's file — a silent text/target mismatch that needed a manual fix after the run.

## Why it matters
Supersession docs frequently reference the old decision BY NAME to explain the change ('supersedes ADR-0005 because…'). Blindly retargeting those links corrupts exactly the sentences that document the supersession, and does so SILENTLY (no report, no warning). The mechanical retarget is 'working as coded', but the output is misleading — a correctness-adjacent defect. The shared rewrite engine (core/rewrite.ts) means 'lore rename' has the same exposure.

## Direction (decide in plan)
- Detect when a link's display text matches the old id (or its bare number/slug) and SKIP + warn (leave it for the author), or
- Emit a per-link report of what was rewritten so the author can review/revert, or
- Provide a way to exclude specific links / a --dry-run-first workflow that surfaces text/target divergences.
Keep the default safe: never silently produce a text/target mismatch.

## Refs
src/core/rewrite.ts (shared rewriteInbound engine used by both supersede + rename), src/commands/supersede.ts, src/commands/rename.ts; related: the shared-engine invariants noted in prior work (LORE-79/80).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When --rewrite-links repoints an inbound link whose display text names the OLD id (or its number/slug), lore does not silently leave a text/target mismatch: it either skips that link with a warning, or surfaces it in a report the author can act on (chosen mechanism recorded).
- [ ] #2 Ordinary inbound links (display text NOT naming the old id) are still retargeted as before — no regression to the normal supersede/rename rewrite.
- [ ] #3 The fix covers BOTH 'lore supersede --rewrite-links' and 'lore rename' (shared core/rewrite.ts engine); a regression test exercises a link whose text names the old id and asserts no silent mismatch.
- [ ] #4 Full suite + lore check stay green.
<!-- AC:END -->
