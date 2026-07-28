---
id: LCLI-279
title: Add deterministic OKF projection export
status: Done
assignee:
  - '@codex'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - projection
  - okf
  - export
  - jsonl
  - release-scope
dependencies: []
references:
  - >-
    /Volumes/external/repos/lore-graph/backlog/tasks/lg-1 -
    Define-and-upstream-the-lore-projection-export.md
documentation:
  - /Volumes/external/repos/lore-graph/docs/specs/okf-projection-contract.md
modified_files:
  - src/core/projection.ts
  - src/commands/export.ts
  - src/cli.ts
  - src/core/manifest.ts
  - src/core/agent-bridge.ts
  - test/projection.test.ts
  - test/fixtures/projection/v1.jsonl
  - test/help.test.ts
  - docker/e2e/run-e2e.sh
  - README.md
  - docs/reference/cli-surface.md
  - docs/reference/okf-projection-contract.md
  - .claude/skills/lore/SKILL.md
  - CHANGELOG.md
priority: high
type: feature
ordinal: 381000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Provide downstream consumers such as lore-graph with a consumer-neutral, versioned, deterministic JSONL export of the repository’s OKF bundle and task associations. The export is a projection of Git/OKF source facts only: it must not encode Neo4j labels, database identifiers, embeddings, or inferred relationships.

This upstream task fulfills lore-graph LG-1. The downstream contract is documented in /Volumes/external/repos/lore-graph/docs/specs/okf-projection-contract.md and the consuming story in /Volumes/external/repos/lore-graph/docs/stories/dogfood-lore-through-neo4j.md. A future session should inspect the current lore command/output conventions before recording an implementation plan.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A supported non-interactive command emits a versioned machine-readable stream containing a manifest, every full OKF concept, every authored concept edge, task records and concept-to-task associations, dangling references, stable content hashes, bundle identity, and the source Git commit
- [x] #2 The stream is deterministic for identical bundle bytes, task snapshot, and explicit Git metadata; duplicate authored links remain distinct through stable ordinal identity
- [x] #3 Golden fixtures cover Unicode, unknown OKF fields and types, duplicate links, dangling concept and task references, empty bodies, and deterministic ordering
- [x] #4 Unsupported breaking projection schema versions fail before bundle, Backlog, Git, or downstream mutation work begins
- [x] #5 The command is registered in CLI help/capability surfaces and the projection compatibility contract is documented for downstream consumers
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pure projection core that emits deterministic schema-1.0 JSONL records for manifest, concepts, authored concept edges, tasks, concept-task associations, and trailer hashes. 2. Add a read-only `lore export --schema-version 1.0` command whose argument validation runs before bundle, Backlog, or Git access and whose environment seams are injectable. 3. Add golden/focused tests for Unicode, unknown fields/types, duplicate and dangling edges, empty bodies, ordering, stable hashes, task associations, and fail-fast unsupported versions. 4. Register export in routing/help/agent capability surfaces and document its compatibility contract in lore. 5. Run focused and full release gates, then finalize the task with evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema 1.0 as a pure deterministic projection core and read-only CLI command. Golden JSONL fixture covers Unicode, producer extensions, empty bodies, duplicate/dangling concept links, duplicate/dangling task associations, stable ordinals, content hashes, and stream hashing. Unsupported schema versions are rejected before filesystem, Backlog, or Git reads. Verified with 2,191 unit/integration tests, clean typecheck/lint/build, lore check/validate, generated-agent drift check, byte-identical live exports under SOURCE_DATE_EPOCH, and Docker E2E 304/304 including a real export envelope.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added lore export schema 1.0: a deterministic, consumer-neutral JSONL projection containing manifest metadata, full concepts, authored edges, the complete Backlog task snapshot, concept-task associations, dangling references, stable ordinal identities, content hashes, and a semantic trailer hash. Registered the command across CLI/help/agent surfaces, documented the compatibility contract, added a golden fixture and fail-fast tests, and added a real Docker E2E assertion. All release gates pass.
<!-- SECTION:FINAL_SUMMARY:END -->
