---
id: LORE-195
title: >-
  Consolidate the triplicated ANSI/control-strip sanitizer into one shared
  helper
status: To Do
assignee: []
created_date: '2026-07-23 04:25'
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
- [ ] #1 A single shared ANSI/control-strip sanitizer exists (e.g. in src/errors.ts alongside singleLine) and is the only definition of that regex pair in src/
- [ ] #2 src/output.ts stripAnsiAndControls, the src/commands/query.ts twin, and src/core/validate.ts sanitizeForMessage all delegate to the shared helper — no duplicated ANSI/control regex literals remain in src/
- [ ] #3 The stale "keep the two in sync" comment(s) are removed or corrected
- [ ] #4 Full bun test + bun run typecheck pass; existing sanitization tests stay green (behavior unchanged)
<!-- AC:END -->
