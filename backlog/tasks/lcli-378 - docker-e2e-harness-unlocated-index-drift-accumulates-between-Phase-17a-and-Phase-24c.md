---
id: LCLI-378
title: >-
  docker e2e harness: unlocated index-drift accumulates between Phase 17a and
  Phase 24c
status: To Do
assignee: []
created_date: '2026-09-03 00:39'
labels:
  - e2e
  - harness
  - tech-debt
dependencies: []
references:
  - docker/e2e/run-e2e.sh Phase 24c (defensive sync comment)
priority: low
ordinal: 505000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While implementing LCLI-377 (lore check now detects stale lore:index managed blocks), real CI surfaced index drift the harness itself was silently carrying. Two sources were found and fixed on the LCLI-377 branch: Phase 16s lore new ADR "E2E successor decision" (the supersede successor) left adr/index.md stale through Phase 17as full unscoped check; Phase 17bs deliberately-kept custom-type doc left the bundle ROOT index stale. After both fixes, Phase 17as own "full unscoped lore check is clean" assertion passes cleanly (confirmed in CI). But Phase 24cs own check step_declared_kind assertion still failed non-zero on a THIRD, unlocated instance -- traced through every intervening phase (scaffold mkdocs/docusaurus/obsidian, agents, instructions, the exit-code + output-mode spot checks, the nested-checkout --show-prefix probe) without isolating the exact call responsible. Rather than keep spending CI round-trips hunting it, a defensive lore sync was added at the top of Phase 24c (docker/e2e/run-e2e.sh), masking the drift rather than fixing its source. This is exactly the shape LCLI-377s own description warns about: a mechanically auto-repairable drift, silently made invisible again. Reproducible locally (no CI round-trip needed): remove the defensive sync line at the top of Phase 24c and re-run the harness through Phase 24c; whichever step first makes the bundle dirty again is the source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact command (or commands) between Phase 17a and Phase 24c that leaves the bundle with genuine index drift is identified
- [ ] #2 Either that command gains its own targeted lore sync immediately after it (matching the Phase 16 / Phase 17b fix pattern already on LCLI-377), or a documented reason is recorded for why the defensive sync at the top of Phase 24c is the correct permanent fix instead
- [ ] #3 If a targeted fix lands, the defensive sync at the top of Phase 24c is reconsidered -- removed if redundant, or its comment updated to name the now-known source if kept as a second line of defense
<!-- AC:END -->
