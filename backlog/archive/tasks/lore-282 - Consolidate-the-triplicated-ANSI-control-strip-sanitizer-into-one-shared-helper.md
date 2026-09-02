---
id: LORE-282
title: >-
  Consolidate the triplicated ANSI/control-strip sanitizer into one shared
  helper
status: Done
assignee: []
created_date: '2026-07-23 04:25'
updated_date: '2026-09-02 22:30'
labels:
  - codex-review-followup
  - errors-output-git
dependencies: []
priority: low
type: chore
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-14 integration review finding (from LORE-161). The ANSI/control-byte strip regex pair is now byte-identical in THREE places: stripAnsiAndControls in src/output.ts (~:409), a local twin in src/commands/query.ts (~:301-307, whose doc comment still says "Keep the two in sync if either changes" — now stale, there are three), and the new sanitizeForMessage in src/core/validate.ts (added by LORE-161). Zero drift today, but three copies must co-evolve and the comments already mislead (validate.ts cites only output.ts, not query.ts). Extract ONE shared sanitizer — natural home is src/errors.ts next to singleLine (layer-neutral, already imported by all three call sites modules) — and route output.ts, query.ts, and validate.ts through it; drop the stale sync comments. Behavior must not change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single shared ANSI/control-strip sanitizer exists (e.g. in src/errors.ts alongside singleLine) and is the only definition of that regex pair in src/
- [x] #2 src/output.ts stripAnsiAndControls, the src/commands/query.ts twin, and src/core/validate.ts sanitizeForMessage all delegate to the shared helper — no duplicated ANSI/control regex literals remain in src/
- [x] #3 The stale "keep the two in sync" comment(s) are removed or corrected
- [x] #4 Full bun test + bun run typecheck pass; existing sanitization tests stay green (behavior unchanged)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renumbered from LORE-195 to LORE-282 on 2026-09-02: that id collided with `backlog/completed/lore-195 - Restore-biome-lint-baseline...md`, a genuinely different task created the same day. LORE-195 is load-bearing for the biome-lint task specifically — it is named in the real completing commit (870abc4, "chore(backlog): mark LORE-195 done", whose message describes the biome-lint restoration verbatim).

Also corrected while investigating: this task's own work is NOT outstanding. doc-3 (backlog/docs/doc-3, the round-2 campaign tracker) records that "a duplicate LORE-195 I briefly minted was archived" the same day this file was created, because the identical consolidation was folded into LORE-181 instead (widened by its own wave-14 note to cover exactly this: output.ts + query.ts + validate.ts, AC#4/#5). LORE-181 is Done, and the current source confirms it: `stripAnsiAndControls` is exported once from src/errors.ts and imported by output.ts and commands/query.ts exactly as this task's ACs describe. Marking this Done (superseded by LORE-181) rather than leaving it "To Do", which would misrepresent live open work that does not exist. Preserved rather than deleted per "neither member is discarded."
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Superseded by LORE-181, which independently executed this exact consolidation (src/errors.ts's shared stripAnsiAndControls, all call sites delegating, stale comments corrected) on 2026-07-23 — see LORE-181's own Final Summary. This task was archived the same day it was created (per doc-3's wave-14 note: "a duplicate LORE-195 I briefly minted was archived"), then renumbered from LORE-195 to LORE-282 on 2026-09-02 to resolve an id collision with the unrelated biome-lint-baseline task. No further action needed.
<!-- SECTION:FINAL_SUMMARY:END -->
