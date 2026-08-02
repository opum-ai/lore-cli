---
id: LCLI-283.3.1
title: Define explicit local workspaces and cross-repository identity
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 13:34'
updated_date: '2026-08-02 06:58'
labels:
  - workspace
  - identity
  - provenance
  - ladybugdb
milestone: m-15
dependencies:
  - LCLI-283.2
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/specs/local-workspace-identity-contract.md
modified_files:
  - src/core/workspace-contract.ts
  - test/workspace-contract.test.ts
  - test/fixtures/workspace/v1.json
  - docs/specs/local-workspace-identity-contract.md
  - docs/specs/local-graph-platform-roadmap.md
  - docs/specs/index.md
  - docs/log.md
parent_task_id: LCLI-283.3
priority: medium
type: task
ordinal: 396000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Specify an explicit local workspace manifest and namespaced identity model for composing selected repository exports without introducing a hidden user-global graph or weakening deterministic provenance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workspace membership is explicit, inspectable, portable where appropriate, and never inferred from all repositories on the machine
- [ ] #2 Concept, task, edge, bundle, repository, commit, export digest, and source identities remain unambiguous across duplicate names and overlapping worktrees
- [ ] #3 Add, remove, branch-change, missing-repository, renamed-repository, conflicting-link, and stale-snapshot behavior is deterministic
- [ ] #4 Workspace databases remain disposable projections with documented rebuild, deletion, and privacy boundaries
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze a strict, versioned lore-workspace-manifest/1 control-plane schema and canonical serializer. Membership is an explicit ordered set of user-named member IDs plus explicit repository locators; no machine-wide discovery, remote inference, or database configuration is permitted. Locator changes are excluded from durable identity so a moved/renamed checkout can preserve membership when its member ID is unchanged. (AC 1, 3, 4)
2. Freeze namespaced identity functions for workspace, member/repository, bundle, commit, export snapshot, concept, task, authored-edge, and source records. Workspace identities combine the explicit workspace ID and member ID with the unchanged repository-local source keys/digests, so duplicate names and overlapping worktrees cannot collide and the existing M6 repositoryScopeKey is never reinterpreted. (AC 2)
3. Define deterministic lifecycle and conflict states for add, remove, locator/rename, branch/commit change, missing repository, stale export, duplicate member IDs, and ambiguous/cross-repository links. Existing authored links remain member-local; no cross-repository edge is inferred from matching names. Any future cross-repository relationship must name both member endpoints explicitly, and conflicting destinations fail the candidate snapshot while preserving the last verified projection. (AC 1-3)
4. Add a versioned conformance fixture and focused tests proving canonical bytes, identity stability across locator changes, identity separation across duplicate names/overlapping worktrees, source-provenance preservation, transition outcomes, strict rejection of implicit/ambiguous membership, and absence of absolute-path, credential, raw-Cypher, or Ladybug physical-schema surfaces. (AC 1-4)
5. Create a Lore Spec for the manifest, identity, transition, privacy, rebuild, and deletion contract; update the local graph roadmap to make it the M8 gate without changing later task scope. Run focused tests, full typecheck/lint/build as appropriate, Lore sync and strict validation/check, git diff hygiene, and adversarial self-review before Backlog finalization. (AC 1-4)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave 12 verified implementation (2026-08-02): froze strict lore-workspace-manifest/1 and lore-workspace-identity/1 contracts with explicit canonical membership, explicit namespaced cross-repository links, locator-free SHA-256 identity chaining, source-key preservation, deterministic transition precedence, and rebuild-only privacy/deletion boundaries. Added lore-workspace-conformance/1 with duplicate display names and overlapping worktrees sharing the same M6 repository scope, bundle, record, and source path; all namespaced identities remain distinct.

Objective evidence: exact Bun 1.2.23 focused suite passes 6 tests / 66 expectations; final full suite passes 2,387 tests / 7,677 expectations across 70 files. TypeScript, Biome across 168 files, compiled 247-module build, and git diff hygiene pass. The branch-built compiled CLI reports Lore sync dry-run would change only docs/specs/index.md and docs/log.md; strict validation reports 0 errors/0 warnings, strict check reports 0 findings across 53 files, and agents --check reports both generated bridge files unchanged.

Adversarial self-review found and fixed two contract gaps before final verification: workspace snapshot identity initially omitted bundle and explicit-link facts, and the public identity serializer initially trusted its typed input rather than strictly rejecting injected locator/private fields. Focused tests now prove both boundaries. No independent reviewer was used because subagents were not authorized.

Authorization boundary: all ACs have local objective evidence, but the task remains In Progress with criteria unchecked. Real branch-built Lore sync is still required and can create a scoped Backlog commit; local source/docs commits, push, PR, merge, and guarded lease return are not authorized. No commit or remote mutation has occurred.
<!-- SECTION:NOTES:END -->
