---
id: LCLI-334
title: Teach agents to select and query Lore workspaces
status: Done
assignee:
  - '@codex'
created_date: '2026-08-16 16:17'
updated_date: '2026-08-19 00:27'
labels:
  - workspace
  - agents
  - instructions
  - skills
  - retrieval
  - 'doc:stories/retrieve-task-scoped-context-with-agent-profiles'
dependencies: []
references:
  - >-
    https://github.com/opum-ai/opum-doc/blob/dev/backlog/tasks/odoc-55.6.4%20-%20Establish-the-queryable-Opum-family-Lore-workspace.md
documentation:
  - docs/stories/retrieve-task-scoped-context-with-agent-profiles.md
priority: high
type: enhancement
ordinal: 457000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make Lore workspace retrieval discoverable and operational for Claude Code, Codex, and other CLI-driving agents. Extend the canonical just-in-time instructions and both generated skill bridges so agents understand the composite-graph mental model, explicit manifest selection, namespaced identities, bounded graph/query/context/path/impact workflows, provenance, and the boundary between repository-local and workspace state. This supports ODOC-55.6.4 without changing the workspace data contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore instructions exposes a workspace topic that accurately explains explicit manifests, composite projections, member-local links, explicit cross-repository edges, namespaced IDs, repository filters, provenance, fallback, and cache scope.
- [x] #2 The overview routes cross-repository questions to the workspace topic without adding repository discovery or an implicit default workspace.
- [x] #3 Generated Claude and Codex Lore skills trigger for workspace and cross-repository retrieval, list the complete discovery/provenance command family, and point to just-in-time workspace guidance while remaining concise.
- [x] #4 The Claude and Codex bridge nudges and checked-in dogfood artifacts are generated from canonical builders rather than independently authored copies.
- [x] #5 Focused instruction, bridge, help, and lockstep tests cover the new topic and prevent command or topic drift; existing single-repository behavior remains unchanged.
- [x] #6 Typecheck, focused and full tests, lint, build, strict Lore validation/check, bridge drift checks, and diff hygiene pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit the shipped workspace/help surface, instruction registry, Claude bridge builder, Codex bridge builder, dogfood artifacts, and tests for agent-discoverability gaps.
2. Add one canonical workspace instruction topic and route cross-repository questions to it from the overview, grounded in the existing workspace contracts and exact CLI behavior.
3. Update both generated skill builders and nudges to trigger on workspace/cross-repository retrieval and expose graph, path, impact, snapshots, changes, provenance, explorer, query, context, and agent profiles without bloating resident guidance.
4. Regenerate checked-in Claude/Codex dogfood artifacts from the builders and update CLI/runbook documentation only where the public instruction contract changes.
5. Add focused registry, rendering, bridge, nudge, and command lockstep tests; prove single-repository behavior is unchanged.
6. Run focused/full tests, typecheck, lint, build, strict Lore validation/check, bridge drift, and diff hygiene; record objective evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added the canonical workspace instruction topic, scope routing, complete Claude/Codex discovery maps, generated dogfood bridges, workspace-aware skill metadata, docs, and focused regression coverage. Verified 72 focused tests; 2,594 pass/1 skip in the full 2,595-test suite; typecheck, Biome lint, compiled build, strict Lore validate/check, bridge drift checks, skill validation, builder byte parity, and git diff --check all passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Taught agents to distinguish owner-local graphs from explicit derived workspace projections and to use qualified, bounded, provenance-preserving retrieval. Updated both canonical bridge builders and dogfood artifacts, documented the public topic, and verified the entire CLI suite and release gates.
<!-- SECTION:FINAL_SUMMARY:END -->
