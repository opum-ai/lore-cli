---
id: LORE-181
title: >-
  Export a single shared stripAnsiAndControls sanitizer and de-duplicate
  query.ts's local copy
status: To Do
assignee: []
created_date: '2026-07-22 17:14'
updated_date: '2026-07-23 04:26'
labels:
  - cmd-crud-b
  - codex-review-followup
dependencies: []
priority: low
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LORE-118 sanitized lore query's renderText output using stripAnsiAndControls, but had to DUPLICATE the function locally in src/commands/query.ts because output.ts's copy is module-private and LORE-118's scope forbade editing output.ts. As of wave 14 there are now THREE byte-identical copies: output.ts's renderTaskSummaryRows seam (stripAnsiAndControls), query.ts's local twin (whose comment still says "Keep the two in sync" — now stale, there are three), and — added by LORE-161 — sanitizeForMessage in src/core/validate.ts. A future divergence between the copies would silently weaken one call site's terminal-escape sanitization, and the sync comments already mislead (validate.ts cites only output.ts). Fix: export a single shared sanitizer (the ANSI/control strip, plus singleLine composition as appropriate) from ONE module — natural home is src/errors.ts next to singleLine (layer-neutral, already imported by all three call sites' modules) — and route query.ts, output.ts, and validate.ts through it, removing the duplicates and correcting the stale comments. Flagged by the wave-6 LORE-118 review; re-confirmed + widened by the wave-14 LORE-161 integration review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 stripAnsiAndControls is defined in exactly one module and imported by both src/commands/query.ts and src/output.ts (no duplicate definition)
- [ ] #2 lore query and lore tasks/orphans output remain sanitized identically — the LORE-118 and LORE-115 regression tests still pass unchanged
- [ ] #3 Typecheck and the full bun test suite are green
- [ ] #4 src/core/validate.ts sanitizeForMessage (added by LORE-161) also delegates to the shared sanitizer — no third copy of the ANSI/control regex remains in src/
- [ ] #5 The stale "keep the two in sync" comments in query.ts / validate.ts are removed or corrected
<!-- AC:END -->
