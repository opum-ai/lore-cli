---
id: LCLI-348
title: Expose opum-agent-workflow/v1 through lore agent context via --contract facade
status: Done
assignee:
  - '@lore-cli'
created_date: '2026-08-25 01:39'
updated_date: '2026-08-25 02:34'
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

Delivered via PR #416, merged to dev as 5158283409d9e8b1f27d5e4aa512ba5cb747b4d0 (head e416f02faee6da3f56085e2249e8b7c6db7b5d3c). Pinned Bun 1.2.23: 2633 pass / 0 fail; typecheck + Biome clean; lore validate/check --strict 0/0; diff hygiene clean. All 8 CI checks green pre-merge. Byte-compat preserved for default context and agent project; facade adds selectedVersion=1/contextId/bare-64-hex digest per accepted Spec.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the additive `lore agent context <profile> --task <taskId> --contract opum-agent-workflow/v1 --json` facade over compileAgentWorkflowProjection with stable version/envelope diagnostics, deterministic contextId, bare 64-hex digest, task/profile/profileRevision binding, source IDs and freshness fields; manifest/help/docs lockstep; determinism, read-only, byte-compatibility and diagnostics coverage. Merged to dev (5158283) after two-axis review and all repository gates.
<!-- SECTION:FINAL_SUMMARY:END -->
