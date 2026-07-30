---
id: LCLI-283.1.2
title: Implement the deterministic LadybugDB projection lifecycle
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:33'
updated_date: '2026-07-30 22:02'
labels:
  - ladybugdb
  - indexing
  - cache
milestone: m-13
dependencies:
  - LCLI-283.1.1
documentation:
  - docs/specs/local-graph-platform-roadmap.md
modified_files:
  - package.json
  - bun.lock
  - src/core/projection.ts
  - src/core/ladybug-source.ts
  - src/core/ladybug-driver.ts
  - src/core/ladybug-lifecycle.ts
  - test/ladybug-lifecycle.test.ts
  - docs/specs/local-graph-platform-roadmap.md
  - docs/runbooks/lore-cli-release-campaign-handover.md
  - docs/log.md
parent_task_id: LCLI-283.1
priority: high
type: task
ordinal: 388000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build and maintain the versioned LadybugDB projection from Lore export records with deterministic identities, transactional replacement, freshness checks, and safe recovery from partial or corrupt state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Identical export records produce an equivalent projection and stable observable metadata on every rebuild
- [x] #2 Changed, deleted, duplicate, dangling, and unknown records reconcile without stale nodes or edges
- [x] #3 Build interruption or corruption leaves either the prior valid projection or a clearly rebuildable state
- [x] #4 Index files are treated as disposable local state and never committed or mistaken for Git or OKF source truth
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Exact-pin official @ladybugdb/core 0.18.2, trust only its install script for the platform-addon copy required by Bun 1.2.23, and introduce a Lore-owned native driver boundary that records both package/runtime and Ladybug storage versions without exposing native ids or Cypher publicly.
2. Add a validated export-1.0 projection source snapshot: canonical task records, sorted byte-hash inventory of docs inputs, active profile bytes, repository/bundle/commit/export facts, taskSnapshotDigest, stable repository/snapshot/commit identities, and a domain-separated sourceFingerprint. Preserve every canonical concept/task/edge source record and unknown field.
3. Implement the ladybug-projection/1 schema and deterministic transactional writer: isolated .building-<token> staging, parameterized inserts for all node and authored-edge records, structural relationships only, CHECKPOINT, explicit close, read-only reopen verification, database digest/length, deterministic index.json written/fsynced last, atomic content-addressed generation rename, and immutable published permissions.
4. Implement repository-confined lifecycle reconciliation with exclusive writer.lock ownership and conservative stale recovery; ordered locked/unsupported/corrupt/rebuildable/reusable classification; read-only complete verification; corruption quarantine only while locked; rebuild-only replacement; abandoned-staging cleanup; owner-token-safe release; and no writes outside .lore/cache/graph/ladybug/1/.
5. Add focused native lifecycle tests for deterministic rebuild/reuse, changed and deleted replacement, duplicate/dangling/unknown-field losslessness, interruption invisibility/recovery, digest and database corruption quarantine/rebuild, ordered lock/unsupported classification, immutable/read-only reuse, and byte-level source no-write guarantees. Keep routing, explorer, indexed capabilities, MCP, vectors, inferred edges, and public Cypher out of scope.
6. Verify with pinned Bun 1.2.23 using focused and full tests, lint, typecheck, build/source-native smoke, compiled/native and package checks. Then follow task-finalization, verify each acceptance criterion, record evidence, run lore sync, lore validate --strict, lore check --strict, and git diff --check without advancing the parent or another child.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the core deterministic lifecycle slice with exact @ladybugdb/core 0.18.2 under Bun 1.2.23 (trusted install script only; runtime 0.18.2/storage 42). Added validated export-1.0 source snapshots and domain-separated fingerprints over docs bytes, profile bytes, task snapshot, versions, repository/bundle/commit facts; stable repository/snapshot/commit identities; lossless canonical manifest/trailer/concept/task/edge records including additive fields, duplicates, and dangling targets.

Added the private Ladybug schema/driver with parameterized writes, one data transaction, CHECKPOINT, explicit close, read-only reopen verification of duplicated metadata, canonical records, primary keys, counts, relationship endpoints, and dangling-target absence. Added repository-confined lifecycle ownership, isolated staging, manifest-last fsync, database digest/length, atomic generation rename, read-only publication/reuse, ordered locked/unsupported/corrupt/rebuildable/reusable classification, conservative stale-lock recovery, corruption quarantine, cleanup, and explicit disposal. No routing or later-scope surface was added.

Focused pinned-Bun evidence so far: lifecycle/projection/contract tests 17 passed with 130 assertions; typecheck clean; Biome lint clean across 123 files. Tests cover deterministic semantic rebuild/reuse (Ladybug physical bytes legitimately vary and each digest is independently verified), changed/deleted replacement, duplicate/dangling/additive fields, interruption recovery, native and duplicated-control corruption, stale/live locks, unsupported preservation, immutable permissions, Git ignore, disposal, and byte-level source no-write.

Final acceptance evidence: identical validated export records publish the same stable sourceFingerprint, generation key, source identities, semantic record set, and observable control metadata; equivalent physical Ladybug files are independently digested and verified because native byte layout may vary. Replacement tests prove changed and deleted records leave no stale nodes or edges, while duplicate edges, dangling targets, and additive fields round-trip losslessly. Interruption, native corruption, duplicated-control corruption, active/stale locks, unsupported formats, compatibility rebuilds, immutable permissions, disposal, Git ignore, source-byte preservation, and cache-symlink containment are covered. Pinned Bun 1.2.23 results: focused lifecycle/projection/contract 19 pass, 0 fail, 135 assertions; full suite 2,264 pass, 0 fail, 6,583 assertions across 53 files; lint 123 files clean; typecheck clean; build 229 modules; frozen install unchanged; native compiled close/reopen read-only smoke passed with Ladybug runtime 0.18.2/storage 42; package dry-run 68 files and 1.36 MB unpacked; audit reported no vulnerabilities. No later child, parent, routing, explorer, M8, MCP, hosted, release, or publication scope was started.

Final documentation gates after task completion: lore sync reconciled Backlog-managed state; lore validate --strict reported 46 files, 0 errors, and 0 warnings; lore check --strict reported 46 files, 0 errors, and 0 warnings; git diff --check was clean. Final audit confirmed origin/dev and feature/lcli-284-commander unchanged, the linked feature/wave2-integration-fixes worktree untouched, parent LCLI-283.1 To Do, and LCLI-283.1.3 To Do.

Landing review found and fixed two in-scope lifecycle defects: published generations are now required to have immutable directory, control-manifest, and database permissions before reuse, with a post-publication interruption test proving complete read-only recovery; abandoned-staging cleanup failure is advisory and cannot block a unique new build. Removed a duplicated native-driver header. Post-review pinned Bun 1.2.23 evidence: focused lifecycle/projection/contract 20 pass, 0 fail, 143 assertions; full suite 2,265 pass, 0 fail, 6,591 assertions across 53 files; lint 123 files clean; typecheck clean; build 229 modules; source/compiled version and JSON usage seam passed; compiled native close/reopen read-only smoke passed with runtime 0.18.2/storage 42; frozen install unchanged across 98 installs/109 packages; package dry-run 68 files/1.36 MB; audit found no vulnerabilities.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and landing-reviewed the deterministic LadybugDB projection lifecycle over validated export schema 1.0 with exact @ladybugdb/core 0.18.2, stable source identities and content addressing, lossless records, immutable atomic generations, ordered lifecycle classification, rebuild-only recovery, read-only verification, advisory cleanup, and repository-source no-write guarantees. Added comprehensive native lifecycle and publication-interruption tests and updated the roadmap and durable campaign handover. All focused/full tests, native, build, and package gates pass; parent LCLI-283.1 and later children remain untouched.
<!-- SECTION:FINAL_SUMMARY:END -->
