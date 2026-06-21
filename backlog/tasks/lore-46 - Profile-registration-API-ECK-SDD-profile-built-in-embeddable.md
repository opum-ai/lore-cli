---
id: LORE-46
title: Profile registration API + ECK SDD profile (built-in + embeddable)
status: To Do
assignee: []
created_date: '2026-06-21 20:16'
labels:
  - eck-alignment
  - core
  - schema
milestone: m-2
dependencies:
  - LORE-45
  - LORE-15
documentation:
  - docs/adr/0006-schema-types-templates.md
priority: high
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the ADR-0006 profile-registration mechanism agreed in the ECK<->Lore alignment (D1). Expose a code-level registerProfile({type, zodSchema, template}) API so the OKF type vocabulary is extensible while Zod stays the single source of truth: profiles are CODE, not declarative JSON; .lore/schemas/*.json remain EMITTED outputs (never authoritative inputs). Ship the default story-convention profile built-in (Epic/Story/Spec/ADR/Runbook/Reference); ship ECK's 17 Title-Case SDD types as an embeddable Zod module. Shared union = ECK SDD types + Lore Epic/Story/Runbook (the latter Lore-only; an ECK 'feature' is a Story instance, not a new shared type). Runtime registration is the LIBRARY/embed path only — the sealed compiled binary (ADR-0001) carries profiles compiled-in; no runtime external-module import. Extends LORE-15 (registry seam in schema.ts) and feeds LORE-19 (tiered validation) + LORE-20 (schema export iterates the registry).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR-0006 amended ('Profiles & registration' subsection): registration API; profiles=code; .lore/schemas stay emitted; the locked union recorded; invariants preserved (warn-not-error unknowns, ISO-string timestamps, byte-stable round-trip, strict-known/lenient-unknown tiers, z.toJSONSchema emission)
- [ ] #2 registerProfile() seam replaces the hardcoded type table in schema.ts; story-convention profile registered by default
- [ ] #3 registration is collision-checked (duplicate type = error) and order-independent on emitted schema bytes (ADR-0014 determinism)
- [ ] #4 standalone compiled binary carries profiles compiled-in (no runtime dynamic-import); embed/registration runtime path is the library artifact (LORE-45)
- [ ] #5 ECK SDD profile shippable as a Zod module; LORE-20 schema export and LORE-19 validation iterate the registry
<!-- AC:END -->
