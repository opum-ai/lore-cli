---
id: LCLI-373
title: lore new adr ignores this repo's own NNNN-slug ADR naming convention
status: To Do
assignee: []
created_date: '2026-09-02 20:12'
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
- [ ] #1 lore new adr auto-numbers the output filename to the next unused NNNN- prefix in docs/adr/, matching this repo's existing convention, without requiring a manual lore rename afterward
- [ ] #2 the numbering scheme is documented (in the ADR template or CLI help) so a hand-authored ADR follows the same convention lore new would produce
- [ ] #3 regression test scaffolds an ADR into a docs/adr/ directory that already has NNNN- prefixed files and asserts the new file gets the next number
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reproduced 2026-09-02 against current dev source: lore new adr "Test ADR Naming Convention" wrote docs/adr/test-adr-naming-convention.md (no prefix), while docs/adr/ already has 15 files following 0001-...-0015- naming. lore rename handles the fix-up correctly if run manually. Likely needs an ADR-specific scaffold path in src/commands/new.ts that scans docs/adr/ for the highest existing NNNN- prefix and increments it, rather than reusing the generic slug-only naming other doc types use.
<!-- SECTION:PLAN:END -->
