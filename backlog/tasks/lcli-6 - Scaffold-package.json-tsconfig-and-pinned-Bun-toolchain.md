---
id: LCLI-6
title: 'Scaffold package.json, tsconfig, and pinned Bun toolchain'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:21'
labels:
  - tooling
milestone: m-1
dependencies: []
documentation:
  - docs/reference/tech-stack.md
priority: high
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
package.json (type module, bin lore, name @salient-data/lore), strict tsconfig, .bun-version pin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bunx . runs the lore stub CLI
- [x] #2 Bun version pinned with a documented rationale
- [x] #3 Bun version pinned to 1.2.23 with a documented rationale
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin Bun 1.2.23 as single source of truth: .bun-version + package.json packageManager/engines; document value + rationale + bump procedure in DEVELOPMENT.md (AC#2).
2. package.json: name @salient-data/lore, type module, bin lore -> src/cli.ts, module field, files allowlist, minimal scripts (lore, typecheck), @types/bun devDep.
3. Strict tsconfig.json (mirror Backlog.md strict bundler config, CLI-only: drop DOM/jsx, types:[bun]).
4. Stub src/cli.ts (#!/usr/bin/env bun): prints name+version from package.json, handles --version/--help; zero runtime deps.
5. bun install to materialize lockfile; verify 'bunx .' runs the stub (AC#1) and 'bun run typecheck' is clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
M0 scaffold complete and verified. Pinned Bun 1.2.23 (.bun-version + package.json packageManager/engines); rationale + bump procedure in DEVELOPMENT.md. Strict CLI-only tsconfig (bundler resolution, noUncheckedIndexedAccess, types:[bun]); zero-runtime-dep stub src/cli.ts (reads version from package.json, handles --version/--help); devDeps @types/bun + typescript (for the typecheck script — lint/format/test harness is LCLI-7). Verified: 'bun install' clean, 'bun run typecheck' passes, 'bun .'/'bun run lore' print the stub, and 'bun link' + 'bunx lore --version' from /tmp prints 0.0.0 (bin correctly wired). Finding: Bun's bunx is registry-only — the npm-style 'bunx .' local-path form errors ('unrecognised dependency format: @.'), so AC#1 was reworded to the Bun-native equivalents.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scaffolded the lore toolchain: package.json (@salient-data/lore, type module, bin lore -> src/cli.ts), strict tsconfig, Bun pinned to 1.2.23 across .bun-version + packageManager/engines (rationale in DEVELOPMENT.md), and a zero-dependency stub CLI. Verified via 'bun install', 'bun run typecheck' (clean), and bin execution through 'bun .', 'bun run lore', and 'bunx lore' (linked). Bun's bunx is registry-only, so AC#1's 'bunx .' was corrected to the Bun-native 'bun .' equivalent.
<!-- SECTION:FINAL_SUMMARY:END -->
