---
id: LCLI-283.3.2
title: Index and retrieve across workspace repositories
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 13:34'
updated_date: '2026-08-02 15:52'
labels:
  - workspace
  - ladybugdb
  - search
  - context
milestone: m-15
dependencies:
  - LCLI-283.3.1
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/specs/local-workspace-identity-contract.md
  - docs/specs/workspace-indexing-and-retrieval.md
  - docs/reference/architecture.md
  - docs/reference/cli-surface.md
modified_files:
  - src/commands/args.ts
  - src/commands/context.ts
  - src/commands/graph.ts
  - src/commands/query.ts
  - src/core/context.ts
  - src/core/graph.ts
  - src/core/ladybug-driver.ts
  - src/core/ladybug-lifecycle.ts
  - src/core/ladybug-source.ts
  - src/core/manifest.ts
  - src/core/query.ts
  - src/core/retrieval.ts
  - src/core/workspace-contract.ts
  - src/core/workspace-projection.ts
  - src/core/workspace-retrieval.ts
  - src/core/workspace-source.ts
  - test/help.test.ts
  - test/workspace-retrieval.test.ts
  - docs/log.md
  - docs/reference/architecture.md
  - docs/reference/cli-surface.md
  - docs/specs/index.md
  - docs/specs/local-graph-platform-roadmap.md
  - docs/specs/local-workspace-identity-contract.md
  - docs/specs/workspace-indexing-and-retrieval.md
parent_task_id: LCLI-283.3
priority: medium
type: task
ordinal: 397000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project all explicitly selected repository exports into one workspace-scoped LadybugDB graph and extend graph, query, and context with bounded repository selection and deterministic merged results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Workspace indexing incrementally adds, updates, and removes selected repository snapshots without retaining stale evidence
- [x] #2 Graph, query, and context support all-workspace or explicit repository subsets with stable limits and ordering
- [x] #3 Every result carries repository, bundle, commit, export digest, concept or task identity, and source path where applicable
- [x] #4 Single-repository behavior remains compatible and workspace isolation tests prevent evidence from unselected workspaces or repositories
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an explicit workspace mode to graph, query, and context: --workspace <manifest-path> selects one lore-workspace-manifest/1 file and repeatable --repository <member-id> selects a validated subset. No flag means the existing single-repository path; no directory, home, Git, or worktree discovery is introduced. Workspace graph/context IDs use the unambiguous <member-id>::<source-id> form, and subset ordering follows canonical manifest member order rather than argument order.
2. Resolve manifest-relative or absolute local member locators through a dedicated control-plane loader. Validate containment-sensitive files, repository roots, expected refs, complete canonical membership, and exact source snapshots before candidate publication. Keep locators, absolute paths, refs, and database details out of durable identities and public results.
3. Build a versioned workspace projection source from each selected member's already validated M6 export. Namespace repository, bundle, commit, export, concept, task, authored-edge, and source-path records through the frozen workspace contract; retain repository-local edges locally; add only explicit manifest-authored cross-repository links; reject missing or conflicting endpoints as a whole candidate.
4. Store the workspace projection in a separate LadybugDB schema and lifecycle below .lore/cache/workspaces/1/<workspaceKey>/. Build and verify a complete immutable candidate under a single-writer lock, publish it atomically, reuse an exactly matching snapshot, preserve the last verified snapshot when a candidate is rejected, and remove superseded member evidence only after safe publication. Retain only the current verified workspace projection in this task; historical retention remains LCLI-283.3.4.
5. Extend the retrieval boundary with a workspace result scope while keeping the existing RetrievalGraph contract unchanged for single repositories. Merge selected member graphs and indexed reads deterministically, enforce repository isolation before graph traversal/search/context hydration, preserve stable global limits and tie-breaks, and dispose every opened member/workspace reader on success or failure.
6. Keep the existing graph.export, query.results, and context.export envelope kinds. In workspace mode add a top-level workspace scope and per-node/hit/target/neighbor provenance containing member and namespaced repository/bundle/commit/export/record/source identities plus original repository scope, bundle ID, commit, export digest, source record identity, and repository-relative source path when present. Single-repository JSON and text output remain byte-compatible when --workspace is absent.
7. Add conformance coverage for add/update/remove/reuse, stale-candidate preservation, duplicate IDs, explicit cross-repository links, missing/conflicting members, repository subsets, deterministic limits/order, reference/indexed parity, resource disposal, platform fallback, privacy/containment, and single-repository regression. Document the accepted CLI, projection, lifecycle, provenance, and compatibility contract with Lore; run focused and full Bun tests, typecheck, Biome, compiled command/help smokes, strict Lore validation/check, bridge drift, and diff hygiene.

Approval gate: implementation starts only after the user approves the public CLI and output contract above. Commit, push, pull request, merge, lease return, branch deletion, primary-checkout mutation, publication, and later-task dispatch remain separately unauthorized.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Local implementation and objective acceptance verification complete in guarded lease e0b342e8cc6d394b528b90fcbf4f0716. Evidence: bun test passed 2398/2398 tests with 7749 assertions; workspace-focused coverage passed 10/10 including add/update/member removal, current-only generation reuse, rejected-candidate preservation, duplicate IDs, exact concept/task cross-repository links, canonical subsets, cross-workspace isolation, bounded ordering, locator redaction, warning-clean fallback, and Windows pre-native fallback. npm run typecheck, npm run lint, npm run build, compiled graph/query/context help smokes, lore validate --strict (54 files, 0 errors/warnings), lore check --strict, and git diff --check passed. lore sync --dry-run remains blocked because the installed Backlog binary is not --json-capable; no generated index/log write was attempted. lore agents --check reports the pre-existing protected .claude/skills/lore/SKILL.md drift and was intentionally not forced. Commit, publication, task closure, tracker settlement, and lease return remain separately unauthorized.

Commit authorization received. Lore sync completed with the repository's documented JSON-capable dist-npm/backlog v1.48.0 binary, regenerated docs/specs/index.md and docs/log.md, and created scoped backlog commit b6c01bc; the immediate follow-up sync dry-run reported zero changes.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-02 14:15
---
Wave 14 dispatched from exact integrated dev 8ddf465c80d60fcd4e04f6393f9f8ebc7937e4e3 on feature/lcli-283-3-2-workspace-indexing in guarded Treehouse lease e0b342e8cc6d394b528b90fcbf4f0716 held by lore-cli/LCLI-283.3.2. Research is complete; source implementation awaits explicit approval of the recorded public CLI and output contract. No source changes, commits, remote operations, lease return, primary mutation, or later-task dispatch occurred.
---
<!-- COMMENTS:END -->
