---
id: LCLI-283.1.5
title: Audit and qualify the supported LadybugDB dependency version
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-01 00:30'
updated_date: '2026-08-01 02:48'
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
  - .github/workflows/ci.yml
  - test/ci-workflow.test.ts
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
- [x] #2 Release notes and executable probes assess API, storage-format, migration/rebuild, Bun 1.2.23, native-addon, Windows fallback, packaging, security, and license compatibility for every candidate version after 0.18.2. Full real-process concurrency and crash qualification remains exclusively owned by LCLI-283.1.4.
- [x] #3 The selected exact version passes frozen installation; native loading on Darwin arm64, Darwin x64, Linux arm64, and Linux x64; projection build/reuse/rebuild; indexed graph/query/context parity; Windows x64 import-safe fallback; and supported-platform package qualification evidence without weakening existing fallback or cleanup guarantees. Full concurrency and crash qualification remains exclusively owned by LCLI-283.1.4.
- [x] #4 Lore either upgrades every exact pin, lock entry, optional-package integrity, fingerprint/control-manifest expectation, fixture, workflow, test, and documentation reference coherently, or records why 0.18.2 remains the latest supported version and what upstream change would unblock it.
- [x] #5 The supported-version decision and evidence are documented in the LadybugDB benchmark and scale acceptance reference, and focused/full verification plus strict Lore validation and coherence gates pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the completed upstream inventory, exact Bun 1.2.23 candidate probes, selected 0.19.0/storage-43 implementation, regression coverage, and Lore documentation evidence. (AC #1-#5)
2. Apply the user-approved scope split: LCLI-283.1.5 owns dependency-version, storage, native-host, Windows fallback, packaging, security, and license qualification; LCLI-283.1.4 exclusively owns full real-process concurrency and crash qualification. (AC #2, #3)
3. Add a dispatch-only CI input that selects only macos-15-intel and ubuntu-24.04-arm for the existing lint/typecheck/test job, while skipping unrelated compile, scaffold, and Docker jobs in that narrow mode. Keep ordinary PR, main-push, and full-matrix behavior unchanged. (AC #2, #3)
4. Add workflow regression coverage and run focused tests, actionlint, typecheck, lint, and diff hygiene locally. (AC #3, #5)
5. Commit and push the scoped task/workflow/test change to the existing PR branch, dispatch the exact-host-only mode at that branch, and collect matching-host runtime/storage/native/test evidence. (AC #2, #3)
6. Follow task finalization criterion by criterion. Mark LCLI-283.1.5 Done only if the existing evidence plus both exact-host jobs objectively prove all revised criteria; otherwise retain In Progress with the precise remaining blocker. Then recompute LCLI-283.1.4 readiness without merging, publishing, or returning the lease unless separately authorized.
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

Remote delivery and host evidence (2026-07-31): feature commit 7d1b17459a34e9dff7dee2dbb820b507e5dc87b6 was pushed and PR #269 opened against dev at https://github.com/salient-data/lore-cli/pull/269. The PR is open, mergeable, and CLEAN; all six required PR checks passed in run 30677534306, including Ubuntu and Windows test legs, compile, MkDocs, Docusaurus, and the real-binary Docker E2E harness. Manual full-matrix run 30677543858 also passed all seven jobs.

Concrete host results from the manual run:
- GitHub macos-latest resolved to image macos-26-arm64. It installed @ladybugdb/core 0.19.0, passed the dynamic addon runtime/storage assertion, and completed 2300 tests with 0 failures.
- GitHub ubuntu-latest resolved to ubuntu-24.04 on the standard x64 runner. It installed @ladybugdb/core 0.19.0, passed the dynamic addon runtime/storage assertion, and ran all 2300 tests with 0 failures (2299 pass, one unrelated platform skip).
- GitHub windows-latest resolved to windows-2025-vs2026 on the standard x64 runner. The exact package metadata, integrities, and import-safe fallback assertions passed; the native addon assertion and native lifecycle suites were intentionally skipped by policy. The leg completed 2218 passes, 82 documented platform skips, and 0 failures.

Residual completion blocker: the available matrix does not execute on Darwin x64 or Linux arm64, and this branch does not contain the real process concurrency/crash qualification owned by the dependent LCLI-283.1.4 machinery. Therefore AC 2 and AC 3 remain open, the task remains In Progress, and PR #269 must not be merged as task-complete evidence yet. No merge, publication, or lease return was authorized.

2026-07-31 scope decision: the user approved option 2. LCLI-283.1.5 retains exact dependency-version and supported-host native/fallback qualification; full real-process concurrency and crash qualification is exclusively deferred to dependent task LCLI-283.1.4. The approved continuation is a narrow manual CI dispatch for only Darwin x64 and Linux arm64, with ordinary CI behavior unchanged.

Option 2 local workflow verification (2026-07-31): added a default-off workflow_dispatch input that selects only macos-15-intel and ubuntu-24.04-arm for the existing check job and skips build, scaffold, and Docker jobs only in that narrow mode. Added static workflow regression coverage preserving the normal PR and full-matrix OS sets plus every unrelated-job skip guard. Local Bun 1.3.14 verification passed: focused CI/Ladybug qualification 7 tests and 42 assertions; full isolated suite 2,303 tests and 6,704 expectations across 56 files; lint checked 128 files; typecheck, actionlint, and git diff --check passed. These local results validate the workflow/configuration change but are not substitutes for the pending exact Bun 1.2.23 Darwin x64 and Linux arm64 host runs.

Exact-host run 30680490024 on commit d7510d2 provided admissible Linux arm64 evidence: ubuntu-24.04-arm completed setup with pinned Bun 1.2.23, lint, typecheck, and all tests successfully. Darwin x64 on macos-15-intel also loaded the selected native addon and passed the runtime/storage assertion, plus 2,302 tests, but the job failed because the unrelated existing 700,000-row runOrphans regression took 29,855 ms and exceeded the generic 10,000 ms per-test timeout. This is a host-speed harness failure, not a LadybugDB failure. Refined only the macos-15-intel test command to a bounded 40,000 ms timeout; normal PR/full-matrix timeouts remain unchanged. Static coverage asserts both the special bound and ordinary 10,000 ms bound. Post-refinement local verification passed 8 focused tests/45 assertions, the full 2,304-test suite/6,707 expectations, lint across 128 files, typecheck, actionlint, and diff hygiene. A clean Darwin x64 rerun remains required before AC 2/3 can close.

Final exact-host evidence (2026-07-31): workflow run 30680661668 completed successfully on shared code/workflow commit 903f7d84f4188c817f6eb1d75544858b10c4d279. macos-15-intel used exact Bun 1.2.23, passed the installed @ladybugdb/core native runtime/storage assertion, and finished 2,304 tests with 0 failures and 6,707 expectations across 56 files. ubuntu-24.04-arm used exact Bun 1.2.23, passed the same installed-addon runtime/storage assertion, and ran 2,304 tests with 2,303 passes, one documented platform skip, 0 failures, and 6,704 expectations across 56 files. Both jobs also passed lint and typecheck; the narrow dispatch skipped compile, scaffold, and Docker jobs as intended. Combined with the prior final-head Darwin arm64, Linux x64, and Windows x64 fallback evidence, this objectively satisfies revised AC 2 and AC 3. Full real-process concurrency/crash qualification remains exclusively in LCLI-283.1.4 per the user-approved scope split. LCLI-283.1.5 remains In Progress pending authorized PR delivery; no merge, publication, or lease return has been performed.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-01 02:37
---
Approved option 2: refine AC 2/3 and run only the missing Darwin x64 and Linux arm64 host legs; leave full concurrency/crash qualification to LCLI-283.1.4.
---
<!-- COMMENTS:END -->
