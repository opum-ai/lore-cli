---
id: LCLI-283.1.5
title: Audit and qualify the supported LadybugDB dependency version
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-01 00:30'
updated_date: '2026-08-01 00:52'
labels:
  - ladybugdb
  - dependency
  - compatibility
  - packaging
milestone: m-13
dependencies:
  - LCLI-283.1.3
references:
  - 'https://www.npmjs.com/package/@ladybugdb/core'
  - 'https://github.com/LadybugDB/ladybug/releases'
documentation:
  - docs/reference/ladybugdb-benchmark-and-scale-acceptance-strategy.md
  - docs/specs/local-graph-platform-roadmap.md
modified_files:
  - package.json
  - bun.lock
  - src/core/ladybug-native.ts
  - test/ladybug-lifecycle.test.ts
  - test/ladybug-version-qualification.test.ts
  - docs/reference/ladybugdb-benchmark-and-scale-acceptance-strategy.md
  - docs/reference/architecture.md
  - docs/reference/tech-stack.md
  - docs/specs/local-graph-platform-roadmap.md
  - docs/runbooks/dev-kickoff.md
parent_task_id: LCLI-283.1
priority: high
type: task
ordinal: 404000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Determine whether Lore's exact @ladybugdb/core pin remains the latest version that Lore can support safely. Lore currently pins 0.18.2 while the npm registry reports latest 0.19.0 as of 2026-07-31. Audit upstream releases and every local native/runtime/storage compatibility boundary, then either qualify and adopt the newest supported stable version or retain the current pin with a documented objective blocker. This task must settle before final LCLI-283.1.4 packaging and performance acceptance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The audit inventories every LadybugDB version, optional-platform package, integrity, runtime/storage-version constant, fixture, workflow, test, and documentation pin in Lore and compares them with the official npm latest tag and upstream stable releases.
- [ ] #2 Release notes and executable probes assess API, storage-format, migration/rebuild, Bun 1.2.23, native-addon, Windows fallback, concurrency, packaging, security, and license compatibility for every candidate version after 0.18.2.
- [ ] #3 The selected exact version passes frozen installation, native loading, projection build/reuse/rebuild, indexed graph/query/context parity, concurrency/crash, and supported-platform package qualification evidence without weakening existing fallback or cleanup guarantees.
- [ ] #4 Lore either upgrades every exact pin, lock entry, optional-package integrity, fingerprint/control-manifest expectation, fixture, workflow, test, and documentation reference coherently, or records why 0.18.2 remains the latest supported version and what upstream change would unblock it.
- [ ] #5 The supported-version decision and evidence are documented in the LadybugDB benchmark and scale acceptance reference, and focused/full verification plus strict Lore validation and coherence gates pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze the audit inventory from the repository and official upstream sources: current 0.18.2 core/platform pins and integrities; stable candidates 0.18.3 and 0.19.0; release/tag chronology; Node package/API metadata; MIT license; Bun/native platform packages; and the storage-42 to storage-43 boundary. Classify historical evidence separately from current normative pins. (AC #1, #2)
2. Under exact Bun 1.2.23 in the isolated Treehouse worktree, establish the frozen 0.18.2 baseline, then evaluate 0.18.3 and 0.19.0 sequentially with exact installs, runtime/storage probes, native load and close/reopen, projection build/reuse/rebuild, indexed graph/query/context parity, lifecycle recovery, audit, and package/build smokes. Retain candidate failures as evidence and do not infer support from registry metadata alone. (AC #2, #3)
3. Select the newest stable candidate that satisfies the executable contract. Update the exact root/lock/platform package set, runtime/storage compatibility constants, fingerprints/control-manifest expectations, and any tests or workflow assertions coherently. A version/storage change must rebuild the disposable projection; Windows must remain import-safe and reference-fallback-only unless executable evidence proves the native policy can change. (AC #3, #4)
4. Add focused regression coverage for the selected package/runtime/storage facts and compatibility rebuild boundary, then run the affected lifecycle/indexed/command/release tests and the full isolated suite with lint, typecheck, source and compiled smokes, frozen reinstall, package dry-runs, audit, and artifact/source-write cleanup checks. Treat unavailable matching-host evidence as an explicit completion blocker, not a simulated pass. (AC #2-#4)
5. Through Lore, update the benchmark/scale decision reference and current architecture, tech-stack, roadmap, and kickoff guidance with official release links, candidate evidence, the selected exact version, storage behavior, and any remaining platform limitation. Preserve historical handover/task evidence as historical facts. Run Lore sync, strict validation/check, and git diff hygiene. (AC #1, #4, #5)
6. Follow task finalization criterion by criterion. Complete LCLI-283.1.5 only with objective evidence for every required host/policy boundary; otherwise leave it In Progress with the exact local result, remote-evidence gap, and safe delivery/continuation step.
<!-- SECTION:PLAN:END -->
