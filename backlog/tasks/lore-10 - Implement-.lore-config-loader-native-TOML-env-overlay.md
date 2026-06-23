---
id: LORE-10
title: Implement .lore config loader (native TOML + env overlay)
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:25'
updated_date: '2026-06-23 13:46'
labels:
  - core
milestone: m-1
dependencies: []
documentation:
  - docs/adr/0013-lore-state-directory.md
priority: high
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parse .lore/config.toml with Bun native TOML; overlay env (LORE_CONFLUENCE_TOKEN never persisted).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 config.toml is committed; cache/ is gitignored
- [x] #2 Reconcile rules and link options are configurable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/config.ts — loadConfig({root?, env?}) → LoreConfig. Sync: existsSync+readFileSync + Bun.TOML.parse; missing file → defaults (zero-config). root/env are injectable seams (design §8).
2. Types: LoreConfig{reconcile{mode,overrides}, validate{externalLinks,promotePortability}, confluence{baseUrl?,space?,parentPageId?,format,token?}}. Map TOML snake_case → TS camelCase at the boundary.
3. Validation: strict type/enum on known keys → LoreError('validation'); malformed TOML → LoreError('validation'); unknown keys tolerated (forward-compat). A 'token' committed under [confluence] → LoreError('validation') (ADR-0013 fail-loud). Token read ONLY from env LORE_CONFLUENCE_TOKEN, never persisted/written back.
4. AC#1: commit .lore/config.toml (cache/ already gitignored at repo root). AC#2: [reconcile] + [validate] are the configurable surface.
5. test/config.test.ts — defaults, full+partial parse, malformed TOML, bad enum/type, env overlay, token-in-file error, unknown-key tolerance; determinism via injected env/root + temp dirs.
6. Align design §2 module tree (add config.ts line; note state.ts consumes it). Update CHANGELOG (Unreleased).
7. Gates: bun test, bun run lint, bun run typecheck. Feature branch → PR into dev.
Decisions (user-approved this session): module = src/config.ts; token-committed-in-file = hard-error (validation).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/config.ts: loadConfig({root?, env?}) -> LoreConfig. Bun-native Bun.TOML.parse (no dependency; parses data not a module, so it survives bun build --compile). Sync via existsSync+readFileSync; a missing file -> zero-config defaults; snake_case TOML mapped to camelCase at the boundary. Hand-rolled type/enum validation (Zod deferred to LORE-15) raises LoreError type=validation (exit 6) on malformed TOML or an out-of-contract value; unknown keys/sections are tolerated for forward-compat. The Confluence token is read ONLY from the LORE_CONFLUENCE_TOKEN env var, never persisted; a committed [confluence].token fails loud (validation) even when the env token is set. Decisions (user-approved this session): (1) module = src/config.ts, a focused loader the design's state.ts consumes (lore-design module tree section 2 + 2.4 updated to match); (2) committed token = hard-error per ADR-0013 fail-loud. Validation: bun test 70 pass / 0 fail (18 new config tests), bun run lint PASS, bun run typecheck PASS; e2e smoke: committed config -> defaults, env token overlays onto confluence, committed token -> --json validation envelope on stderr + exit 6.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added src/config.ts, the .lore/config.toml loader: Bun-native TOML parse (no dependency) into a typed, validated LoreConfig (reconcile/validate/confluence) with injectable root/env seams and zero-config defaults. The Confluence token is environment-only (LORE_CONFLUENCE_TOKEN); a committed token fails loud. Malformed or out-of-contract config raises a validation LoreError (exit 6); unknown keys are tolerated. Committed lore's own .lore/config.toml (AC#1; cache/ already gitignored at repo root) and added test/config.test.ts (18 tests). Aligned the design module tree (lore-design sections 2 and 2.4). Gates green: 70 tests pass, lint + typecheck clean, e2e smoke verified. Delivered as feature branch feat/lore-10-config-loader -> PR into dev; left In Progress pending review/merge.
<!-- SECTION:FINAL_SUMMARY:END -->
