---
id: LORE-46
title: 'Declarative .lore profile: per-project type vocabulary, schemas & templates'
status: To Do
assignee: []
created_date: '2026-06-21 20:16'
updated_date: '2026-06-21 21:44'
labels:
  - eck-alignment
  - core
  - schema
milestone: m-2
dependencies:
  - LORE-15
documentation:
  - docs/adr/0006-schema-types-templates.md
priority: high
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make lore's OKF type system PROFILE-DRIVEN via a declarative per-project profile (.lore/profile.toml or .lore/profile.json), per the ECK<->Lore alignment (D1, declarative-only resolution). The profile is the authoring SOURCE OF TRUTH for: the type vocabulary, per-type frontmatter fields (types/enums/required-vs-optional), required body sections, and template refs. lore builds its runtime validators and editor JSON-Schemas FROM the profile at load, so there is still ONE source of truth, inverted from ADR-0006's Zod-in-code (now: declarative profile -> generated validators). lore ships a default story-convention profile (Epic/Story/Spec/ADR/Runbook/Reference); ANY project (e.g. an ECK-managed repo) configures its own types by dropping in a profile file -- NO code, NO library embedding, fully usable with the STANDALONE binary (it reads the profile as DATA). This supersedes the earlier code-registration/embeddable-module idea: there is NO code escape hatch -- the declarative profile language is the boundary (covers vocabulary, fields, enums, required sections, templates, simple constraints; arbitrary cross-field/custom refinements are out of scope). The format is an ergonomic lore-specific schema, NOT hand-authored raw JSON Schema (which ADR-0006 rejected). lore bundles NO consumer-specific profile; ECK ships its profile as config in its own repo. Extends LORE-15 (schema.ts builds validators from the profile); feeds LORE-19 (tiered validation) + LORE-20 (schema export iterates the profile).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR-0006 amended: the declarative .lore/profile is the source of truth for type vocabulary + per-type schema; lore generates runtime validators + editor JSON-Schemas from it (supersedes 'Zod-in-code is THE single source of truth' for the type/profile layer). Invariants preserved: warn-not-error on unknown types, ISO-string timestamps, byte-stable round-trip, strict-known/lenient-unknown tiers, JSON-Schema editor emission
- [ ] #2 Profile format defined (toml/json): type vocabulary; per-type required/optional fields with types (string, string[], ISO-date, enum, number, boolean) + simple constraints; required body sections; template ref. Ergonomic lore format, NOT raw JSON Schema
- [ ] #3 lore ships the default story-convention profile built-in (Epic/Story/Spec/ADR/Runbook/Reference); fully usable with zero config
- [ ] #4 A project configures custom types by adding .lore/profile.* — read by the STANDALONE binary as DATA; no code, no library/embedding required; lore bundles NO consumer-specific profile (ECK ships its profile in its own repo)
- [ ] #5 NO code-registration / escape hatch: the declarative language is the boundary; document the expressiveness limit (no arbitrary cross-field/custom refinements)
- [ ] #6 LORE-15 builds validators from the active profile; LORE-19/LORE-20 iterate it; profile loading is deterministic (sorted, order-independent emitted bytes — ADR-0014)
<!-- AC:END -->
