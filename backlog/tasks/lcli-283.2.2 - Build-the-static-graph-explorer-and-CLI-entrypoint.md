---
id: LCLI-283.2.2
title: Build the static graph explorer and CLI entrypoint
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 13:33'
updated_date: '2026-08-01 23:42'
labels:
  - graph-explorer
  - frontend
  - cli
milestone: m-14
dependencies:
  - LCLI-283.2.1
  - LCLI-283.1
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/specs/graph-explorer-data-and-interaction-contract.md
  - docs/reference/cli-surface.md
modified_files:
  - .gitignore
  - .claude/skills/lore/SKILL.md
  - src/core/explorer.ts
  - src/commands/explorer.ts
  - src/core/manifest.ts
  - src/core/agent-bridge.ts
  - src/cli.ts
  - test/explorer.test.ts
  - test/explorer-command.test.ts
  - test/help.test.ts
  - docs/specs/graph-explorer-data-and-interaction-contract.md
  - docs/specs/local-graph-platform-roadmap.md
  - docs/reference/cli-surface.md
  - docs/log.md
parent_task_id: LCLI-283.2
priority: high
type: task
ordinal: 393000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generate and open an offline-capable Lore graph explorer from the stable indexed projection, with a deterministic static artifact and a constrained local entrypoint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The CLI produces a deterministic self-contained or clearly versioned static explorer artifact without mutating source documentation
- [x] #2 The explorer implements search, type and status filters, node details, provenance, inbound and outbound highlighting, depth focus, dangling references, and supersession chains
- [x] #3 Static mode makes no network requests and live mode, if included, binds only to loopback with no write or arbitrary-query surface
- [x] #4 Empty, single-node, cyclic, disconnected, duplicate-edge, Unicode, and large graph fixtures render correctly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pure explorer implementation that maps the validated projection source into lore-explorer-snapshot/1, derives deterministic filtered/focused relationship views, and renders a self-contained HTML artifact with embedded data and no network-capable dependencies. (AC #1-#4)
2. Add the lore explorer command with a default .lore/explorer/index.html target, optional repo-confined --out, atomic create/update behavior, collision protection for custom outputs, and explicit refusal to write under docs/, backlog/, or .git/. Wire it into the manifest, Commander router, help, and stable explorer.artifact output. (AC #1, #3)
3. Implement the semantic browser runtime for search, kind/status filters, selected-node details and provenance, inbound/outbound highlighting, bounded depth focus, dangling references, supersession chains, empty/health states, and bounded initial visibility. (AC #2-#4)
4. Add production-mapping, view-model, artifact, command/router/help, path-safety, determinism, offline, and empty/single/cyclic/disconnected/duplicate/Unicode/large-fixture coverage. (AC #1-#4)
5. Update the graph-explorer contract, local-graph roadmap, and CLI surface through the Lore workflow; run focused and full pinned Bun tests, typecheck, Biome, build/smokes, Lore sync, strict validation/check, and diff hygiene, then perform an adversarial self-review before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave 8 implementation evidence (2026-08-01): implemented the deterministic lore-explorer-snapshot/1 projection, self-contained offline HTML renderer, semantic search/type/status filters, details and provenance, inbound/outbound relationship views, bounded depth focus, dangling and supersession views, and a repository-confined atomic lore explorer command. Full pinned Bun 1.2.23 suite: 2,378 pass, 0 fail, 7,599 expectations across 68 files. TypeScript typecheck passed. Biome checked 162 files with no fixes. Production build compiled 247 modules. Repeated compiled explorer runs were byte-stable and unchanged: snapshot sha256:3a04b9fe072cdc57bd71f1e1bc2415a37bb40c2e6b9e4a39abb9d883e3b31c8a; artifact sha256:3e3178cce8aa512efe648f8975a8835bba9dc1ba0ddec8eb26df5aa0d2989e0b; 1,240,315 bytes; 46 concepts, 318 tasks, 733 authored edges, 26 dangling edges, 307 duplicate edges. Artifact audit found no private absolute paths or database credential/query surfaces. Compiled agents check, strict Lore validation (52 files, 0 errors, 0 warnings), strict Lore check (52 files, 0 errors, 0 warnings), and git diff hygiene passed. Adversarial self-review caught and fixed an invalid embedded-script newline escape and corrected a stale globally generated agent bridge by regenerating from this branch. Lore sync dry-run reports only docs/log.md would change. A real Lore sync is intentionally withheld because it would create a scoped Backlog commit and this restore did not grant commit authority; task remains In Progress pending that authorization.
<!-- SECTION:NOTES:END -->
