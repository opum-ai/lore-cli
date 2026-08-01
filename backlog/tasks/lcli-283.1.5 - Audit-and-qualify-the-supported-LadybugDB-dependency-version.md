---
id: LCLI-283.1.5
title: Audit and qualify the supported LadybugDB dependency version
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-01 00:30'
updated_date: '2026-08-01 01:14'
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
- [x] #1 The audit inventories every LadybugDB version, optional-platform package, integrity, runtime/storage-version constant, fixture, workflow, test, and documentation pin in Lore and compares them with the official npm latest tag and upstream stable releases.
- [ ] #2 Release notes and executable probes assess API, storage-format, migration/rebuild, Bun 1.2.23, native-addon, Windows fallback, concurrency, packaging, security, and license compatibility for every candidate version after 0.18.2.
- [ ] #3 The selected exact version passes frozen installation, native loading, projection build/reuse/rebuild, indexed graph/query/context parity, concurrency/crash, and supported-platform package qualification evidence without weakening existing fallback or cleanup guarantees.
- [x] #4 Lore either upgrades every exact pin, lock entry, optional-package integrity, fingerprint/control-manifest expectation, fixture, workflow, test, and documentation reference coherently, or records why 0.18.2 remains the latest supported version and what upstream change would unblock it.
- [x] #5 The supported-version decision and evidence are documented in the LadybugDB benchmark and scale acceptance reference, and focused/full verification plus strict Lore validation and coherence gates pass.
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave 1 local qualification result (2026-07-31):

- Official npm and upstream release audit identified 0.18.3 and 0.19.0 as the stable candidates after the prior exact 0.18.2 pin. The audited core plus five optional platform packages are MIT licensed; exact package metadata and integrities are now asserted by tests and recorded in the LadybugDB acceptance reference. Upstream 0.19.0 advances the storage format from 42 to 43 and can read the prior format; Lore still treats the version or storage change as a disposable-projection rebuild boundary.
- Under exact Bun 1.2.23 on Darwin arm64, 0.18.2, 0.18.3, and 0.19.0 each passed the same 184 focused native lifecycle, retrieval, graph, query, and context tests with zero failures and a clean Bun audit. A real storage-42 projection created with 0.18.2 opened read-only and returned its row under 0.19.0/storage 43.
- Selected @ladybugdb/core 0.19.0 and updated the exact root and lock pins, all five optional-platform package records and integrities, runtime/storage expectations, explicit old-control compatibility fixtures, and a new qualification test. Current architecture, tech-stack, roadmap, kickoff, and benchmark/scale guidance now document the decision and rebuild-only migration policy through Lore.
- Final local verification is green: frozen install checked 103 installs across 109 packages; affected tests 48 pass and 0 fail; full suite 2300 pass and 0 fail with 6694 expectations across 55 files; lint 127 files clean; typecheck clean; Bun audit reports no vulnerabilities; strict Lore validation has 0 errors and 0 warnings; strict Lore coherence has 0 findings across 47 docs; git diff hygiene is clean; exact-Bun compile and source/compiled help smokes pass; root and all five platform package dry-runs pass with no archive or database artifacts retained. The platform dry-runs were run from each package directory after correcting an initial package-spec invocation.
- Adversarial self-review found remaining 0.18.2 references only in historical or explicit baseline evidence, no normative stale pin, no generated artifact, and no claim that manifest-only checks prove native host support. No independent review has occurred.

Completion blocker: this Darwin arm64 checkout cannot supply matching-host Darwin x64, Linux arm64, Linux x64, or Windows fallback package evidence, nor the required supported-platform concurrency/crash qualification. Those boundaries must run on matching hosts before AC 2 and AC 3, and therefore the task, can close. LCLI-283.1.4 already contains the expanded qualification machinery but formally waits on this task. The implementation and documentation remain uncommitted in the leased Treehouse worktree; the branch also contains local replay commits 6c9ff65 and fb9db3a plus Lore automatic task-sync commit 7a51ac8. No push, PR, merge, publication, or lease return was authorized or performed.

Delivery authorization and pre-commit grounding (2026-07-31): the user explicitly approved committing and pushing the scoped feature branch, opening its PR, and dispatching matching-host CI. After fetching origin, the branch contained current origin/dev with no rebase required. The final dirty-tree rerun under exact Bun 1.2.23 passed all 2300 tests with 0 failures and 6694 expectations; lint, typecheck, strict Lore validation, strict Lore coherence, and git diff hygiene also passed. AC 2 and AC 3 remain open until objective matching-host and concurrency/crash results arrive.
<!-- SECTION:NOTES:END -->
