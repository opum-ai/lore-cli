---
id: LCLI-373
title: lore new adr ignores this repo's own NNNN-slug ADR naming convention
status: Done
assignee: []
created_date: '2026-09-02 20:12'
updated_date: '2026-09-03 02:27'
labels: []
dependencies: []
references:
  - >-
    Reported in an issues dump relayed via opum-agent from other agents'
    lore/quest sessions
  - '2026-09-02'
modified_files:
  - src/commands/new.ts
priority: medium
type: bug
ordinal: 500000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore new adr "Title" writes docs/adr/<slug>.md, with no numeric prefix. All 15 existing ADRs in this repo (0001-runtime-build-distribution.md through the current tip) follow an 0001-, 0002-, ... NNNN-slug naming convention. Every ADR scaffold therefore needs a manual lore rename (which works correctly and updates index.md) or --out immediately afterward to match the convention, and nothing prompts for this -- it's silently inconsistent by default.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore new adr auto-numbers the output filename to the next unused NNNN- prefix in docs/adr/, matching this repo's existing convention, without requiring a manual lore rename afterward
- [x] #2 the numbering scheme is documented (in the ADR template or CLI help) so a hand-authored ADR follows the same convention lore new would produce
- [x] #3 regression test scaffolds an ADR into a docs/adr/ directory that already has NNNN- prefixed files and asserts the new file gets the next number
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Document the NNNN- ADR numbering scheme (per opum-agent ruling: --help + template header only, no separate docs page). 1. Add a trailing note to the 'lore new adr' example in src/core/manifest.ts's examples[] (renders live in 'lore new adr --help'). 2. Add a doc-comment above ADR_TEMPLATE in src/core/template.ts pointing at new.ts's nextAdrNumber(). 3. Add one sentence to docs/adr/index.md's existing Process section (hand-authored-ADR guidance), not a new docs page. 4. Verify: lore validate + lore check stay green; tsc/bun test unaffected.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified live: 'lore new adr --help' now prints the NNNN- auto-numbering note under Examples. lore validate docs/adr/index.md and lore check (76 files) both exit 0 after the docs/adr/index.md prose edit. tsc --noEmit clean; bun test test/help.test.ts test/new.test.ts: 103/103 pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
AC2 closed (minimal scope per opum-agent ruling: no separate docs page). The NNNN- auto-numbering scheme is now documented in two places a hand-authoring user or agent actually sees: (1) 'lore new adr --help' -- src/core/manifest.ts's adr example now carries a trailing note ('-> docs/adr/NNNN-....md, auto-numbered to the next unused NNNN- prefix'), verified live via the CLI; (2) docs/adr/index.md's existing Process section gained one sentence on the NNNN-slug.md convention. Also added a doc-comment above ADR_TEMPLATE in src/core/template.ts pointing at nextAdrNumber(). Verified: lore validate + lore check (76 files) exit 0; tsc --noEmit clean; bun test test/help.test.ts test/new.test.ts 103/103 pass.
<!-- SECTION:FINAL_SUMMARY:END -->
