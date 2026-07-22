---
id: LORE-181
title: >-
  Export a single shared stripAnsiAndControls sanitizer and de-duplicate
  query.ts's local copy
status: To Do
assignee: []
created_date: '2026-07-22 17:14'
labels:
  - cmd-crud-b
dependencies: []
priority: low
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LORE-118 sanitized lore query's renderText output using stripAnsiAndControls, but had to DUPLICATE the function locally in src/commands/query.ts because output.ts's copy is module-private and LORE-118's scope forbade editing output.ts. There are now two byte-identical copies (output.ts's renderTaskSummaryRows seam + query.ts's local copy). A future divergence between the twins would silently weaken one call site's terminal-escape sanitization. Fix: export a single shared stripAnsiAndControls (and its singleLine composition as appropriate) from one module and have both query.ts and output.ts import it, removing the duplicate. Flagged by the wave-6 LORE-118 review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 stripAnsiAndControls is defined in exactly one module and imported by both src/commands/query.ts and src/output.ts (no duplicate definition)
- [ ] #2 lore query and lore tasks/orphans output remain sanitized identically — the LORE-118 and LORE-115 regression tests still pass unchanged
- [ ] #3 Typecheck and the full bun test suite are green
<!-- AC:END -->
