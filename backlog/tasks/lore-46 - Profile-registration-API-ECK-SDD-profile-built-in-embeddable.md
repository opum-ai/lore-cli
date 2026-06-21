---
id: LORE-46
title: >-
  Profile registration API + built-in story profile (consumer profiles
  embeddable, not bundled)
status: To Do
assignee: []
created_date: '2026-06-21 20:16'
updated_date: '2026-06-21 20:23'
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
Implement the ADR-0006 profile-registration mechanism agreed in the ECK<->Lore alignment (D1) as a GENERAL, consumer-agnostic extension point. lore works fully standalone: it ships ONLY its own default story-convention profile (Epic/Story/Spec/ADR/Runbook/Reference) in the binary and package — no consumer-specific content, no ECK dependency. Expose a code-level registerProfile({type, zodSchema, template}) API so ANY consumer can extend the OKF type vocabulary while Zod stays the single source of truth (profiles are CODE, not declarative JSON; .lore/schemas/*.json stay EMITTED outputs). ECK is the first-class example consumer: it ships ITS OWN 17 Title-Case SDD types as a Zod module and registers them via the embed/library path (LORE-45) — that profile lives in ECK, not lore. Runtime registration is the library/embed path only; the sealed compiled binary (ADR-0001) bundles only lore's built-in profile, no runtime external-module import. Shared type union for the integration = ECK SDD types + lore Epic/Story/Runbook (the latter Lore-only; an ECK 'feature' is a Story instance). Extends LORE-15 (registry seam in schema.ts); feeds LORE-19 (tiered validation) + LORE-20 (schema export iterates the registry).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR-0006 amended ('Profiles & registration' subsection): registration API; profiles=code; .lore/schemas stay emitted; the locked union recorded; invariants preserved (warn-not-error unknowns, ISO-string timestamps, byte-stable round-trip, strict-known/lenient-unknown tiers, z.toJSONSchema emission)
- [ ] #2 registerProfile() seam replaces the hardcoded type table in schema.ts; story-convention profile registered by default
- [ ] #3 registration is collision-checked (duplicate type = error) and order-independent on emitted schema bytes (ADR-0014 determinism)
- [ ] #4 lore's standalone binary and package bundle ONLY lore's own default (story-convention) profile — no consumer-specific content; lore is fully usable with zero ECK (or any consumer) dependency
- [ ] #5 consumer profiles (e.g. ECK's 17 SDD types) register via the embed/library path (LORE-45) as a Zod module OWNED BY THE CONSUMER — never compiled into lore
- [ ] #6 registration API is consumer-agnostic; LORE-20 schema export and LORE-19 validation iterate the registry (built-in story profile + any registered profiles)
<!-- AC:END -->
