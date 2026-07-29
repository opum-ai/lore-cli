---
id: LCLI-20
title: lore schema export (Zod to JSON Schema + modeline)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:22'
labels:
  - cmd
milestone: m-2
dependencies:
  - LCLI-15
documentation:
  - docs/adr/0006-schema-types-templates.md
priority: medium
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Emit Draft-7 JSON Schema via Zod toJSONSchema per type to .lore/schemas/, plus a yaml.schemas snippet and modeline maintenance for editor autocomplete.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Exported schema drives YAML autocomplete in VS Code/Obsidian
- [x] #2 Custom user types export too
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented `lore schema export [--out <dir>] [--type <T>]` (commands/schema.ts), registered in cli.ts. Per-type Draft-7 JSON Schema bytes come from a NEW shared pure emitter core/schema.ts `emitSchemaFiles` that core/scaffold.ts (lore init) now also calls, so exported schemas are byte-identical to scaffolded ones (no-rework: one byte contract). Profile loaded from .lore/profile.toml so custom types export (AC#2); zero-config falls back to the story-convention profile. AC#1: emitted schemas + the existing modeline drive VS Code/Obsidian autocomplete. Folded /code-review max (workflow, 15 verified findings): slug-collision data-loss now rejected at profile load (core/profile.ts seenSlugs guard — protects init/export/templates); --out confined to repo (no clobber outside bundle); full export prunes orphaned *.schema.json (stale-schema drift); readValue rejects flag-shaped/-- values; duplicate --out/--type rejected; added cli.ts dispatch test. Skipped (rationale): non-atomic multi-file write (PLAUSIBLE; matches init, schemas are regenerable) and cross-file refactors (shared arg-parser/usage()/plural()/per-file type — separate task, not LCLI-20). Gates: 818 tests pass, biome clean, tsc clean, new modules 100% func coverage.
<!-- SECTION:NOTES:END -->
