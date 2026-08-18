---
id: LCLI-315.4
title: Ship the installed Quest 0.2.7 package as Lore’s default tracker backend
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 21:49'
updated_date: '2026-08-18 06:06'
labels:
  - quest
  - tracker
  - default-backend
  - quest-0.2.7
dependencies:
  - LCLI-315.1
parent_task_id: LCLI-315
priority: high
type: feature
ordinal: 438000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Target the explicitly authorized installed Quest 0.2.7 package and QCLI-97.9 migration qualification. Lore pins the observed schemaVersion 1 subprocess contract and fails loud on artifact drift; this task does not claim public registry publication.

New bundles persist [tracker] backend = "quest" explicitly. Lore never invokes mutating quest init implicitly: an uninitialized selected workspace reports the exact quest init action. Existing zero-config Backlog bundles migrate only through Quest-owned preview/apply/status receipts with explicit actors and alias-preserving canonical T-N mappings, and Lore persists Quest only after verified applied state. Explicit Backlog/Jira stay unchanged. No silent fallback, lossy migration, automatic initialization, private Quest storage coupling, or dual writing is permitted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The installed Quest 0.2.7 package provenance, managed local executable path, version, schemaVersion 1 manifest, instructions, and clean disposable-workspace behavior are qualified against completed QCLI-97.9 evidence without claiming public publication
- [x] #2 A Quest backend implements the full TrackerAdapter probe, status-flow, list, view, search, create, and edit contract observed from the installed 0.2.7 package with bounded subprocess execution
- [x] #3 TrackerAdapter statusFlow remains asynchronous so Lore queries Quest workflow configuration instead of duplicating it
- [x] #4 New Lore bundles persist backend = "quest" explicitly and a selected uninitialized Quest workspace produces the exact quest init action without a silent mutation
- [x] #5 A legacy zero-config Backlog bundle migrates only through Quest public preview/apply/status receipts with explicit actor attribution, verified alias mappings, source-read-only behavior, and backend persistence only after state applied; failures retain Backlog and name rollback or recovery
- [x] #6 Explicit Backlog and Jira configurations remain honored, and missing or incompatible Quest never falls back or dual-writes
- [x] #7 Unit, adapter-contract, init, legacy migration, noninteractive, timeout, missing-binary, incompatible-schema, installed-package, alias-resolution, receipt-state, source-drift, and clean-workspace tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin the Quest adapter, documentation, and fixtures to installed 0.2.7, including exact manifest migration descriptors, instructions, actor flags, envelopes, argv safety, timeout, and artifact/source parity.
2. Consume Quest’s public migration backlog preview/apply/status lifecycle; validate digest, mappings, aliases, receipt state, and source identity before persisting Quest.
3. Preserve explicit quest init ownership, zero-config legacy detection, explicit Backlog/Jira selection, failure recovery, and no private-storage coupling.
4. Align coupled Story and reference surfaces with the qualified 0.2.7 package and artifact provenance.
5. Run disposable source/installed-artifact qualification, focused/full tests, typecheck, lint, build, strict Lore gates, independent cumulative review, diff hygiene, and dev delivery gates.
6. Deliver through dev, settle LCLI-315.4/doc-23, and clean only campaign artifacts proved merged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the first adapter/configuration slice: Quest is selectable, new init bundles persist [tracker] backend = "quest", TrackerAdapter.statusFlow() is async across Backlog/Jira/reconciliation, and a bounded argv-only Quest subprocess transport validates schemaVersion/kinds and maps missing binary/workspace diagnostics. Focused init/tracker/Jira/reconcile tests, typecheck, lint, lore validate --strict, lore check --strict, and git diff --check pass. Publication AC remains deliberately unchecked: local Quest 0.2.0 was verified but no fresh public-registry evidence was collected.

Handover 2026-08-17: corrected Quest envelope handling so direct array payloads from task list/search are accepted, and cleared subprocess timeout handles after successful exits. A real disposable Git/Quest workspace using installed quest 0.2.0 passed probe, status-flow, list, view, search, and edit through createQuestAdapter. Verification passed: npm run typecheck, npm run lint, npm run build, full npm test, 108 focused tracker/init/reconcile tests, lore validate --strict, lore check --strict, and git diff --check. Worktree remains intentionally uncommitted on dev; no publish, version bump, global Lore install, lore sync, or Quest init was run in this repository. Next start point is test/quest-adapter.test.ts, followed by the legacy migration-or-pin boundary. Known incomplete behavior: Quest detail projection currently supplies neutral defaults for several rich task fields, and legacy zero-config Backlog selection still resolves silently to Backlog instead of forcing the required first-use choice.

Restore campaign evidence — 2026-08-17

Published-contract qualification replaced the stale 0.2.0 assumption with fresh public-registry evidence: @opum-ai/quest latest is 0.1.0; no public 0.2.0 exists. A disposable clean Git workspace qualified the installed public package through probe, status-flow, list, view, search, create, edit, documentation/labels, and legal To Do -> In Progress -> Done transitions.

Integrated on feat/lcli-315-4-quest-default at de6296138995a568262367f98c94c836e5d03d37:
- exact Quest 0.1.0 manifest/status-flow/envelope validation and diagnostic mapping;
- bounded subprocess transport, argv safety, timeout coverage, and full rich task-detail projection;
- async TrackerAdapter.statusFlow across Backlog/Jira/Quest consumers;
- explicit quest persistence for new bundles while explicit Backlog/Jira remain honored;
- adapter contract tests, including missing/incompatible payloads and real subprocess timeout;
- coupled contract/reference/Story/CHANGELOG documentation aligned with shipped behavior.

Verification on the exact HEAD is green: full npm test (2603 pass, 1 skip, 0 fail; 82 files), npm run typecheck, npm run lint, npm run build, lore validate --strict (73 files, 0 errors/warnings), lore check --strict (73 files, 0 errors/warnings), and git diff --check.

Human decision required before AC #4/#5/#7 and delivery can be completed. Public Quest 0.1.0 has no init command, no task migration command, and no create milestone representation; clean zero-state reads already work. Choose either (A) retarget LCLI-315.4 to the published 0.1.0 contract and authorize a Lore-owned explicit Backlog-to-Quest migration design plus a new superseding/amending ADR, with milestone rejected until upstream support, or (B) hold for a future Quest release that provides init/migration/milestone semantics. No silent migration, fallback, or dual writing has been added.

Final independent review correction — 2026-08-17

The cumulative review found one receiver-safety defect in Quest searchByLabel: it called this.listTasks and failed when the interface method was destructured. Commit ff5d0b465088bcec772ed88a48669e80fbdeb8e6 replaces that dependency with a closed-over helper and adds the detached-call regression test. Exact-head verification passes: full npm test (exit 0), typecheck, lint (201 files), build, lore validate --strict (73 files, 0 errors/warnings), lore check --strict (73 files, 0 errors/warnings), and git diff --check.

Environment evidence is intentionally distinguished: the PATH-local development binary reports 0.2.0, but the public npm registry latest/dist-tag is 0.1.0. The adapter targets and clean-install qualification use the published 0.1.0 contract. The unreleased/local 0.2.0 binary is not release evidence and cannot resolve the missing init/migration/milestone contract decision.

Installed Quest 0.2.0 RC qualification and lossless-migration boundary — 2026-08-17

The user explicitly authorized the currently installed Quest 0.2.0 RC as the target. Live evidence pins quest --version = 0.2.0; schemaVersion 1 manifest.registry; the nullable version descriptor; the mutating workspace.initialized init descriptor; task.status-flow/list/view/search/create/edit kinds; exact actor flags; and the RC task payload. Lore now requires .quest/workspace.toml and emits run `quest init` without initializing implicitly. No public npm publication claim is made.

A clean disposable end-to-end migration probe established a material incompatibility: Quest accepts only canonical ids matching ^T-[1-9][0-9]*$ and exposes no alias/import write path. A standard Backlog TASK-1 migration exits with Invalid canonical id before creating a Quest task or persisting the backend. The implementation therefore preflights the full source and destination set and rejects ordinary LCLI-*/TASK-* and dotted ids before any Quest write. Choosing a new T-N allocation would require an explicit policy for rewriting every Story task reference and task back-reference plus rollback/resume semantics; that product decision is not inferred.

Current feature-branch implementation adds the RC adapter contract, strict workspace/probe validation, legacy artifact selection, explicit migration-or-pin init boundary, id-preserving compatible-task migration, reserved priority/ordinal label round-trip, and fail-loud noncanonical-id guards. Independent cumulative review found and fixed two safety issues: create rejects noncanonical caller ids before spawn, and destination reuse compares priority/ordinal. Verification is green: 201 focused tests; full npm test exit 0; typecheck; lint (205 files); build; lore validate --strict (73 files, 0 errors/warnings); lore check --strict (73 files, 0 errors/warnings); git diff --check.

Human decision required: either authorize non-lossy T-N remapping with repository-wide Story/task reference rewrites and a new ADR, or keep/pin Backlog until Quest adds alias/import ID preservation. No PR, merge, task completion, sync, or delivery is permitted before that choice.

Owner decision — 2026-08-17

Option 2 selected: keep existing zero-config bundles pinned to Backlog and do not deliver the Quest default until Quest exposes an alias/import or equivalent ID-preservation mechanism. The Lore feature branch remains fail-loud and is retained; no T-N remapping or repository-wide Story/task reference rewrite is authorized.

Upstream Quest Backlog audit at quest-cli dev d2aeacc382b7c9a7e05fa5e400b4163bebaa2058 found no exact open task for public alias-preserving cutover. QCLI-87 is Done and implemented the internal Backlog importer with fresh canonical IDs plus namespaced/unambiguous aliases. QCLI-77 is Done and implements alias resolution. QCLI-97.5 is To Do but covers broad Lore adapter conformance and does not expose the importer or a public migration lifecycle. The installed 0.2.0 RC manifest has no import/migration command.

Three scoped attempts to create a new QCLI-97 subtask through the Quest Backlog CLI were rejected before mutation by this session sandbox: EPERM creating /Volumes/external/repos/quest-cli/.git/backlog.md/locks/create. Quest dev remained clean and no upstream task was created. A paste-ready quest-cli handoff must therefore begin by repeating the search and creating the focused task, then expose the existing QCLI-87 importer through versioned preview/apply/status/rollback-or-equivalent CLI operations, canonical mapping receipts, alias resolution, packed-CLI tests, and Lore conformance. No Lore delivery resumes until that upstream build is qualified.

Quest worktree-state correction — 2026-08-17

A later explicit Quest status check at the same HEAD showed concurrent unrelated tracked changes plus untracked QCLI-98 through QCLI-107 tasks. The earlier clean observation was stale or raced with another owner. The three failed create attempts still made no requested alias-import task: each stopped at the Backlog lock mkdir EPERM, and a fresh search/list found no new QCLI-97 subtask. The quest-cli handoff must preserve and classify all current dirty work, re-search live, create the new task through Backlog only if still absent, and use an isolated worktree for implementation rather than touching the shared dirty primary tree.

Quest 0.2.2 first qualification — 2026-08-17

QCLI-97.8 is Done at feature commit a73ee49ebf5025a1aef278c708f36879e18ed3dc and exposes migration backlog preview/apply/status/rollback. A disposable committed Backlog source with LCLI-1 and dotted LCLI-1.1 proved deterministic T-1/T-2 mappings, familiar and namespaced aliases, durable applied receipt/status, canonical alias views, source provenance, priority/ordinal, and documentation through the installed native artifact.

Blocking artifact drift: the committed a73ee49 source and instructions require --actor/--actor-kind for apply and rollback, and source execution accepts them. The installed 0.2.2 native artifact rejects those actor flags as usage and successfully mutates when they are omitted; its installed instructions likewise omit the actor flags. The installed wrapper is callable by absolute path and reports 0.2.2, but the current tool login PATH does not include its NVM bin directory. Lore must not qualify or deliver against the actor-free stale artifact. Continue implementation against the committed QCLI-97.8 contract, then rerun installed-artifact qualification after Quest rebuild/reinstall produces source-equivalent actor enforcement.

Quest 0.2.2 Lore integration and requalification — 2026-08-17

Integrated Quest public migration receipts on feat/lcli-315-4-quest-default through commits f95f281, 1d84010, f47cbc1, and 4f4934a. Lore now pins exact Quest 0.2.2/schema 1 manifest descriptors; validates inner migration.backlog.receipt schema, mappings, state, survivors, and task fingerprints; persists a symlink-safe Lore-owned pending preview before actorful apply; resumes interruptions through status --digest; switches backend only after state applied; and accepts a canonical Quest task only when the requested legacy reference is returned as a validated alias. Quest parentId and authorId fields map into the neutral detail contract. Reconciliation now preserves the injected/selected adapter for status-flow and task reads.

Verification is green: 2627 pass, 1 intentional skip, 0 fail across 84 test files; typecheck; lint (205 files); compiled build; lore validate --strict (73 files, 0 errors/warnings); lore check --strict (73 files, 0 errors/warnings); git diff --check.

Installed-artifact qualification remains blocked. In disposable target /private/tmp/lore-quest-022-requal.NG6Bgq, installed quest --version reported 0.2.2 and preview produced digest 35a2eea5d74cdf3e62b95cc914602351782bd1b207472cc137b1c58852a024ab with LCLI-1/LCLI-1.1 -> T-1/T-2 alias mappings. However actor-free `quest migration backlog apply --source /private/tmp/lore-quest-022-source.5RnL16 --digest <digest> --json` exited 0 and mutated, returning state applied. This contradicts QCLI-97.8 source a73ee49, which requires --actor/--actor-kind and must deny actor-free apply/rollback. AC #1/#5/#7 and delivery remain open until the installed native artifact is rebuilt/reinstalled from the actor-enforcing source contract and the same executable lifecycle is rerun.

Final recovery/review hardening — 2026-08-17

Commit 340a881 adds typed migration transport errors, exact pending-preview recovery when status reports no receipt (reapply the same stored digest; never allocate a new preview), and explicit documentation that installed 0.2.2 remains unqualified. Independent cumulative review found no additional alias, receipt-state, or selected-adapter blocker after these fixes.

Exact-head gates at 340a881 are green: 2629 pass, 1 intentional skip, 0 fail across 84 test files; typecheck; lint (205 files); compiled build; lore validate --strict (73 files, 0 errors/warnings); lore check --strict (73 files, 0 errors/warnings); git diff --check. A compiled-Lore disposable run against the stale installed artifact exited 2 on actorful apply, left tracker.backend unpersisted, and retained `.lore/quest-backlog-migration.pending.json` with the reviewed digest. The remaining blocker is unchanged: corrected installed Quest actor enforcement.

Restore requalification and independent review — 2026-08-17

The live global wrapper `/Users/jdnewhouse/.nvm/versions/node/v24.18.0/bin/quest` reports 0.2.2 but resolves to `/private/tmp/quest-v0.2.2-qcli101.1NYgC7/candidate`; its schemaVersion 1 manifest omits all four `migration backlog` commands. The retained QCLI-97.8 native `/private/tmp/quest-v0.2.2/npm/quest-darwin-arm64/bin/quest` reports 0.2.2 and exposes the migration descriptors, but SHA-256 `f89ad3faff24d42f8c0737738361aa8e55163c3551e73d76728a3fb7a2f6611e` is the stale committed artifact at source ref `a73ee49`: actor-free apply and rollback exit 0 and mutate, while actorful operations exit 2 as usage.

Coordinator qualification in `/private/tmp/lore-quest-022-restore.oGxeRU` and independent review in `/private/tmp/lcli3154-quest-review.w0hD51` reproduced digest `35a2eea5d74cdf3e62b95cc914602351782bd1b207472cc137b1c58852a024ab`, LCLI-1/LCLI-1.1 aliases, actor-free writes, and actorful rejection without changing the committed Backlog source. An independent ref/artifact sweep found no existing executable that both exposes the migration lifecycle and enforces actor attribution.

AC #1, #5, and #7 and delivery remain blocked. Required external action: rebuild and install a provenance-pinned Quest 0.2.2+ native artifact whose manifest exposes preview/apply/status/rollback, whose packed executable denies actor-free apply/rollback with exit 4, and whose actorful lifecycle succeeds. Lore must not weaken its fail-loud contract or deliver against either drifting candidate.

Quest handback — 2026-08-17

Live source grounding: quest-cli origin/dev is 2457ac2e36103ed73b70f41e4f476cbefeac0159 and contains the migration lifecycle. The currently installed quest reports 0.2.2 but its wrapper resolves to /private/tmp/quest-v0.2.2-qcli101.1NYgC7/candidate/bin/quest.cjs; its schema-1 manifest omits migration backlog preview, apply, status, and rollback. Do not substitute repository-local source or treat the version string alone as artifact provenance.

External handback required from QCLI-97.9: provide a version newer than 0.2.2 across the root and all six native packages; matching package checksums and attributable source commit; a clean packed/installable artifact that does not resolve through the retained /private/tmp launcher; installed quest --version and schema-1 manifest evidence; exact migration command kinds and mutability; black-box preview/status, actor/write validation, and complete apply/rollback evidence; and reinstall plus packed-artifact qualification evidence.

Lore must not mutate the Quest repository or publish/install Quest without separate authority. Once QCLI-97.9 hands back this evidence, resume LCLI-315.4 only against the corrected installed artifact, complete cross-product conformance tests, update doc-23, and return the supported Quest version, source SHA, artifact checksum, install provenance, and test results.

Quest 0.2.7 durable-artifact qualification — 2026-08-18

QCLI-97.9 is Done. Its retained handback records source/lifecycle commit 5f94475, artifact commit 436f4f6, root tarball SHA-256 f189a51af13a9ee2f45fc01b2f9de312c6aa36fdb3d6820889a51abbabffb50d, Darwin ARM64 tarball SHA-256 4d95674989908f4248811544b1c8f53d45ee2053bbfc2c550d7f876b6b9d20ce, clean packed-install qualification, actor-free apply/rollback exit-4 denials, and preview/apply/LCLI-315.4 alias/status/rollback evidence. No registry publication occurred.

Active Quest resolves from /Users/jdnewhouse/.local/bin/quest to /Users/jdnewhouse/.local/lib/node_modules/@opum-ai/quest/bin/quest.cjs, reports 0.2.7, and exposes the exact schema-1 migration descriptors: preview migration.backlog-preview nonmutating; apply migration.backlog-applied mutating; status migration.backlog-status nonmutating; rollback migration.backlog-rolled-back mutating. Active launcher SHA-256 is 4c4a801394100767f483ef6ab55c944527fb9933060a5fe004e95f4dda860ab2; active darwin-arm64 binary SHA-256 is 76e86cf02c6aa19ac1da9df4452f24f47bc78c1f397bf68e8e9a9722273e697c.

Lore now pins its adapter and regressions to 0.2.7. Live adapter probe in a disposable initialized Git/Quest workspace returns {version: 0.2.7, schemaVersion: 1}. Focused Quest adapter/migration tests pass (15); full test suite, typecheck, lint, build, strict Lore validate/check, and diff hygiene pass. QCLI-97.5 is the external tracker item for this Lore adapter; this campaign has current-repository authority only and does not modify Quest.

Independent review on 2026-08-18 found and resolved stale 0.2.2/QCLI-97.8 durable metadata and corrected the milestone claim: Quest 0.2.7 has milestone-record commands but no task-to-milestone attachment in the task contract. Review found no remaining blocking defect. Exact post-review gates pass: typecheck, lint, full tests, build, strict Lore validate/check, and diff hygiene.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-17 15:05
---
Handover ready: resume at plan step 1; all current gates are green, but ACs remain unchecked until the missing legacy flow and qualification matrix are implemented.
---
<!-- COMMENTS:END -->
