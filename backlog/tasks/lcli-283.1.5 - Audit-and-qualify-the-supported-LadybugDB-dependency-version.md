---
id: LCLI-283.1.5
title: Audit and qualify the supported LadybugDB dependency version
status: To Do
assignee: []
created_date: '2026-08-01 00:30'
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
