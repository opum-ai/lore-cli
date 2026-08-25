---
id: LCLI-348
title: Expose opum-agent-workflow/v1 through lore agent context via --contract facade
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-25 01:39'
updated_date: '2026-08-25 01:40'
labels:
  - agents
  - context
  - contract
dependencies: []
ordinal: 469000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Additive normative support for `lore agent context <profile> --task <taskId> --contract opum-agent-workflow/v1 --json` over the delivered compileAgentWorkflowProjection, keeping default context and `agent project` byte-compatible. Response must satisfy the accepted facade validator: selectedVersion=1; exact task/profile/profileRevision; deterministic contextId; bare 64-hex sha256 digest; source IDs; freshness/request binding; stable version/envelope diagnostics.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Red: tests pinning agent context --contract opum-agent-workflow/v1 --json envelope (selectedVersion=1, contextId, bare 64-hex digest, task/profile/profileRevision, sources, freshness, request binding; version/envelope diagnostics).
2. Green: extend AgentAction.context with optional --contract; when opum-agent-workflow/v1, bind taskId and route through compileAgentWorkflowProjection; default context and project unchanged byte-for-byte.
3. Manifest/help goldens + determinism/read-only coverage.
4. Pinned Bun 1.2.23 suite, typecheck, Biome, lore validate/check --strict, diff/secrecy hygiene.
5. Two-axis review (standards+spec) on pinned diff; verify gates.
6. Commit/push/PR to origin/dev under standing authority; monitor checks; merge when eligible; verify dev blob/receipt.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered under ODOC-71.8 correction correlation 652f0adb12aa416a86b34535e25a423c on lease 75154cf0352b8f4dc3a41aa0a1c767c2.
<!-- SECTION:NOTES:END -->
