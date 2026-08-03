---
id: LCLI-283.3.3
title: Add bounded path and impact operations
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:34'
updated_date: '2026-08-03 16:10'
labels:
  - ladybugdb
  - path
  - impact
  - traversal
  - 'doc:stories/build-the-persistent-local-graph-platform'
milestone: m-15
dependencies:
  - LCLI-283.3.2
documentation:
  - docs/specs/bounded-path-and-impact.md
  - docs/specs/local-graph-platform-roadmap.md
  - docs/reference/architecture.md
  - docs/reference/cli-surface.md
  - docs/stories/build-the-persistent-local-graph-platform.md
modified_files:
  - src/commands/path.ts
  - src/commands/impact.ts
  - src/commands/traversal.ts
  - src/cli.ts
  - src/core/agent-bridge.ts
  - src/core/ladybug-driver.ts
  - src/core/ladybug-native.ts
  - src/core/ladybug-source.ts
  - src/core/manifest.ts
  - src/core/retrieval.ts
  - src/core/traversal.ts
  - src/core/workspace-projection.ts
  - src/core/workspace-retrieval.ts
  - test/traversal.test.ts
  - test/indexed-retrieval.test.ts
  - test/workspace-retrieval.test.ts
  - test/help.test.ts
  - docs/specs/bounded-path-and-impact.md
  - docs/specs/local-graph-platform-roadmap.md
  - docs/specs/index.md
  - docs/reference/architecture.md
  - docs/reference/cli-surface.md
  - docs/log.md
parent_task_id: LCLI-283.3
priority: medium
type: enhancement
ordinal: 398000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose bounded, explainable path and change-impact operations over authored workspace relationships without exposing raw Cypher or allowing unbounded traversal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Path queries accept typed endpoints, direction and edge allowlists, maximum depth, result limits, and repository scope
- [x] #2 Impact queries distinguish direct and transitive authored dependencies and report completeness, truncation, and traversal limits
- [x] #3 Results preserve the exact edge chain and source provenance needed to explain why each result was included
- [x] #4 Cycles, duplicate edges, dangling targets, no-path cases, high fan-out, and cross-repository isolation have deterministic fixtures and cost bounds
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze two additive public commands. lore path <from> <to> requires --from-kind and --to-kind (concept or task); lore impact <id> requires --kind. Both accept --direction <outbound|inbound|either>, repeatable --edge allowlists, --max-depth, --limit, and the established --workspace plus repeatable --repository scope. Repository-local IDs remain unqualified; workspace IDs retain <member-id>::<source-id>. The default maximum depth is 4 with a hard maximum of 16; the default result limit is 20 with a hard maximum of 100; every traversal has a hard 10,000-edge visit budget. User depth and result bounds constrain the requested search, while the visit budget truncates explicitly rather than permitting unbounded work.
2. Add a storage-neutral traversal model over exact projection records: typed endpoints, distinct duplicate authored edges, resolved versus dangling targets, manifest-authored link kinds, deterministic edge order, endpoint and edge provenance, repository membership, and explicit traversal-cost accounting. Implement breadth-first simple-path enumeration in shortest-first deterministic order and impact expansion with direct versus transitive classification, canonical evidence chains, cycle safety, no-path behavior, completeness, depth-bound, and truncation signals.
3. Extend retrieval with a traversal reader beside the existing BundleGraph. The reference path builds it from the validated repository/workspace projection source. The indexed path reads the same exact endpoint and AuthoredEdgeRecord facts through the verified Ladybug generation. Repository subsets filter endpoints and edges before traversal; automatic fallback completes before output, and explicit indexed policy fails rather than changing semantics.
4. Add path.result and impact.result envelopes without changing graph.export, query.results, context.export, or single-repository behavior. Results expose the requested typed scope and limits, exact ordered edge chains, locator-free record provenance, shown/truncated/complete accounting, and human output with clear direct/transitive and truncation labels. No Cypher, physical table names, inferred relationships, database IDs, or hidden repository discovery enter the public contract.
5. Add deterministic conformance fixtures and tests for concept/task endpoints, all directions, edge allowlists, duplicate edges, cycles, dangling targets, no path, high fan-out, max depth, result and visit caps, repository subsets, cross-repository isolation, provenance, reference/indexed parity, fallback, disposal, CLI parsing/help, output modes, and unchanged graph/query/context contracts.
6. Document the frozen bounded traversal contract as a new Lore Spec and update the local graph roadmap, architecture, CLI surface, generated spec index/log, and task coupling surfaces through Lore. Verify focused traversal/workspace/driver tests, the full pinned Bun suite, typecheck, Biome, build/help smokes, strict Lore validation/check, agent bridge drift, git diff hygiene, and adversarial self-review before finalization.

Approval recorded 2026-08-02: the user approved the public command, endpoint, limit, and result contract above. Commit, push, PR, merge, lease return, branch deletion, primary mutation, publication, and later-task dispatch remain separately unauthorized.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The user approved the complete public traversal contract and recommended bounds on 2026-08-02. Source and documentation implementation may proceed; commit, push, PR, merge, lease return, branch deletion, primary mutation, publication, and later-task dispatch remain separately unauthorized.

Implementation complete on the guarded branch. Added typed path/impact CLI commands, storage-neutral bounded BFS, persisted Ladybug traversal reads, repository/workspace selection, exact endpoint and edge source provenance, additive result schemas, and Lore documentation. Objective verification: bun test (2,408 pass, 0 fail); focused traversal/indexed/workspace/help/agent suites (121 pass, 0 fail before final inbound regression); final traversal suite (9 pass, 0 fail); bun run typecheck; bun run lint (177 files); bun run build; compiled path/impact help smokes; lore validate --strict (0 errors, 0 warnings); lore check --strict (0 errors, 0 warnings); git diff --check. Host reported Bun 1.3.14 while the repository remains pinned to Bun 1.2.23. Lore sync unexpectedly created local commit 8f52dcb after its dry-run reported no Backlog commit; the commit was immediately unwound with a mixed reset to exact integration SHA 17d19dc, preserving every file unstaged. No commit, push, publication, lease return, or dependent-task dispatch occurred.

Final adversarial fixture expansion now passes 10 traversal cases (29 expectations), explicitly proving duplicate authored edges remain distinct, dangling targets are not traversed, and no-path results are deterministic and complete.

Delivery authorized 2026-08-02. Created scoped feature commit 1034229 from exact integration base 17d19dc after revalidating origin/dev, the guarded lease, no duplicate PR, all four checked ACs, no staged drift, and diff hygiene. Push/PR/required-check monitoring/merge are proceeding serially; terminal integration evidence will be appended after GitHub settles.

Delivery settled 2026-08-02: pushed exact terminal head 467d66c09a151e48ec09ccf1b486dc9391f8d4a2, opened PR #283, and verified all eight required CI jobs passed in run 30771545848. GitHub merged the guarded head into dev as b6701d2c65fea43b42f2ad24439f703ae2663740. Fetched origin/dev matches that merge and contains the terminal head as an ancestor. Guarded implementation lease f950113d7717952d34dd67888ddbb960 was returned with exact lease-ID and holder checks. Branch deletion, primary-checkout mutation, and publication remain out of scope.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-02 21:09
---
Wave 15 dispatched from exact integrated dev 17d19dc5aff8cc4bc81d1607f4dc7f95f96550a4 on feature/lcli-283-3-3-bounded-traversal in guarded Treehouse lease f950113d7717952d34dd67888ddbb960 held by lore-cli/LCLI-283.3.3. Contract research and planning are authorized; source implementation waits for review of the material public path/impact CLI and output contract. No commit, remote operation, lease return, primary mutation, publication, or later-task dispatch is authorized.
---

author: @codex
created: 2026-08-02 22:22
---
Approved contract activated: depth default 4/hard maximum 16; result default 20/hard maximum 100; edge-visit hard budget 10,000. Implementation is proceeding on the existing guarded branch and lease.
---

author: @codex
created: 2026-08-02 23:15
---
Delivery complete: PR #283 merged exact head 467d66c as b6701d2 after all eight required jobs passed in run 30771545848; exact guarded lease return succeeded.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented bounded explainable path and impact traversal across exact concept, task, and explicit workspace edges, with depth/result/10,000-edge bounds, deterministic shortest evidence, direct/transitive impact, indexed/reference parity, locator-free endpoint and edge provenance, additive JSON envelopes, CLI help, tests, and Lore documentation. Verified by 2,408 full-suite passes, final 10-case traversal coverage, clean type/lint/build/help smokes, strict Lore validation/check, and diff hygiene. Delivered through PR #283: exact terminal head 467d66c09a151e48ec09ccf1b486dc9391f8d4a2 passed all eight required jobs in run 30771545848 and merged as dev commit b6701d2c65fea43b42f2ad24439f703ae2663740. The exact guarded implementation lease was returned.
<!-- SECTION:FINAL_SUMMARY:END -->
