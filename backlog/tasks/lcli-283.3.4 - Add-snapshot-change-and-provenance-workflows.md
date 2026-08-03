---
id: LCLI-283.3.4
title: Add snapshot change and provenance workflows
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 13:34'
updated_date: '2026-08-03 00:32'
labels:
  - ladybugdb
  - history
  - changed
  - provenance
  - graph-explorer
  - 'doc:specs/snapshot-change-and-provenance-workflows'
milestone: m-15
dependencies:
  - LCLI-283.3.3
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/specs/snapshot-change-and-provenance-workflows.md
modified_files:
  - .claude/skills/lore/SKILL.md
  - docs/log.md
  - docs/reference/architecture.md
  - docs/reference/cli-surface.md
  - docs/specs/graph-explorer-data-and-interaction-contract.md
  - docs/specs/index.md
  - docs/specs/local-graph-platform-roadmap.md
  - docs/specs/lore-design.md
  - docs/specs/snapshot-change-and-provenance-workflows.md
  - docs/specs/workspace-indexing-and-retrieval.md
  - src/cli.ts
  - src/commands/changed.ts
  - src/commands/explorer.ts
  - src/commands/provenance.ts
  - src/commands/snapshot.ts
  - src/core/agent-bridge.ts
  - src/core/explorer-contract.ts
  - src/core/explorer.ts
  - src/core/manifest.ts
  - src/core/snapshot-runtime.ts
  - src/core/snapshot-store.ts
  - src/core/snapshot.ts
  - src/core/workspace-contract.ts
  - src/meta.ts
  - test/browser/explorer.pw.ts
  - test/explorer-command.test.ts
  - test/explorer.test.ts
  - test/fixtures/README.md
  - test/fixtures/snapshot/v1.json
  - test/help.test.ts
  - test/snapshot-command.test.ts
  - test/snapshot.test.ts
parent_task_id: LCLI-283.3
priority: medium
type: enhancement
ordinal: 399000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use retained explicit projection snapshots to answer bounded changed-since and provenance questions and surface those workflows in the CLI and graph explorer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Users can compare explicit repository commits or workspace snapshots and retrieve added, removed, changed, and relationship-delta evidence within stable limits
- [x] #2 Provenance traces each snapshot and result to repository, commit, export digest, bundle, record identity, and source path without treating derived layout or indexes as authored history
- [x] #3 Retention and deletion are explicit and bounded; removed repositories or workspaces leave no unintended snapshot evidence
- [x] #4 CLI and explorer views share conformance fixtures for empty diffs, renames, supersession, duplicate links, missing snapshots, truncation, and multi-repository changes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze three additive public workflows. `lore snapshot <retain|list|delete>` manages only explicitly retained current repository or `--workspace <manifest>` projections; retention is never automatic. `lore changed <from> <to>` compares two retained snapshot keys or unambiguous retained repository commits, accepts explicit workspace plus repeatable repository and kind filters, and defaults to 100 results with a hard maximum of 1,000. `lore provenance <id>` requires `--kind <concept|task|edge>` and `--snapshot <selector>`. Retain/list/delete use exact scope selection; workspace-id selection permits explicit cleanup after a manifest is removed. `lore explorer` gains optional retained snapshot and from/to comparison modes without changing its current no-flag artifact bytes.
2. Add a storage-neutral `lore-retained-snapshot/1` fact envelope and contained store below `.lore/cache/snapshots/1/`. Retain complete identity/provenance plus comparison fields, but not concept bodies, locators, credentials, database paths, derived layout, or native identifiers. Canonical immutable files are keyed by repository/workspace scope and snapshot key. Retain is idempotent, allows at most 16 explicit snapshots per scope, never evicts silently, and rejects over-cap, unexpected-entry, symlink, containment, mixed-scope, incomplete, corrupt, or unsupported states. Deletion names one snapshot or explicitly requests the whole selected scope; it never touches sources, manifests, other scopes, or current M6/M8 indexes.
3. Implement a pure deterministic comparison/provenance core shared by CLI and explorer. Merge ordered stable concept/task/edge identities to classify added, removed, and changed facts plus relationship deltas. A stable concept whose path changes is a changed record with a path field delta; an ID change is remove/add, never an inferred rename. Duplicate links remain distinct by record key, supersession remains an authored edge, and missing/ambiguous selectors fail loud. Results carry both snapshot descriptors and exact repository/member, bundle, nullable commit, export digest, record key, and source-path evidence. Scan at most 1,000,000 facts and report shown/scanned/truncated/complete deterministically.
4. Wire snapshot, changed, and provenance commands through Commander, the additive capability manifest, generated agent bridge, shared output/error seams, and explicit repository/workspace selection. Commit selectors resolve only among retained snapshots; multiple exports at one commit are ambiguous and require a snapshot key. Automatic/reference behavior remains cross-platform and no public command accepts Cypher or exposes physical storage.
5. Add a separate `lore-explorer-change-snapshot/1` data contract for from/to comparison mode and extend the semantic offline explorer with added/removed/changed/unchanged filters, field and relationship deltas, paired provenance, keyboard/focus/live-region behavior, and existing bounded rendering. The frozen `lore-explorer-snapshot/1` parser and ordinary `lore explorer` output remain compatible.
6. Add one versioned conformance fixture consumed by snapshot storage, changed/provenance CLI, and explorer tests for empty diffs, path renames, supersession, duplicate links, missing and ambiguous snapshots, truncation, explicit deletion, retention cap, removed members/workspaces, and multi-repository changes. Author a new Lore Spec, update the roadmap, explorer/architecture/CLI references and generated surfaces through Lore, then verify focused tests, full Bun suite, typecheck, Biome, build/help smokes, three-engine explorer qualification, strict Lore validation/check, agent bridge drift, and diff hygiene.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave 16 dispatch research completed against the exact integrated M6 lifecycle, M7 explorer contract, M8 workspace identity/indexing contracts, bounded traversal contract, current-only workspace reconciliation, and projection identity implementation. The proposed public command, retention, deletion, comparison, provenance, and explorer schemas are material product contracts and await explicit user approval before source or docs implementation. No commit, push, PR, merge, publication, lease return, branch deletion, primary mutation, or parent settlement is authorized by this dispatch record.

Contract approved by the user on 2026-08-02. Implementation is authorized for all six recorded plan steps: explicit retained snapshot management, bounded changed/provenance operations, storage-neutral facts and deletion safety, additive Commander/manifest/agent surfaces, separate explorer change mode, shared fixtures, and Lore documentation. Delivery actions remain separately unauthorized.

Implementation and adversarial review complete in the guarded feature worktree. Evidence: Biome checked 185 files clean; TypeScript clean; Bun 2425/2425 tests pass; Playwright 18/18 passes across Chromium, Firefox, and WebKit; compiled binary and new-command help smokes pass; worktree-source Lore sync/validate --strict/check --strict and agents --check pass with 56 docs, 0 errors, 0 warnings; git diff --check passes. Retained parsing rejects mixed/duplicate/unsafe/sensitive evidence and builders recursively omit sensitive frontmatter keys. Delivery remains unauthorized and the source/docs/test changes remain uncommitted. Lore's required link/sync workflow created isolated backlog-only commits 13f3920 and fc1dd66; no implementation commit, push, PR, merge, lease return, primary mutation, branch deletion, publication, or parent settlement occurred.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-02 23:29
---
Wave 16 dispatched from exact integrated dev 3c2080db74850fb0e5d50f69d85c4104f644a1c9 on feature/lcli-283-3-4-snapshot-provenance in guarded Treehouse lease 12fff023a4d96eee844a7c0c4918377f held by lore-cli/LCLI-283.3.4. No competing PR or lease exists. Implementation waits for approval of the material snapshot/changed/provenance/retention/explorer contract.
---

author: @codex
created: 2026-08-02 23:45
---
Approved contract activated. Source, tests, and Lore documentation implementation may proceed on the existing guarded branch and lease.
---
<!-- COMMENTS:END -->
