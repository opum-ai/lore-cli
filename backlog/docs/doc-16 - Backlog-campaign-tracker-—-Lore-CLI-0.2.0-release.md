---
id: doc-16
title: Backlog campaign tracker — Lore CLI 0.2.0 release
type: other
created_date: '2026-08-09 05:47'
updated_date: '2026-08-09 14:07'
---
# Backlog campaign tracker — Lore CLI 0.2.0 release

## Scope and order confirmation
- Scope: reconcile the completed OKF 0.2 parent, prepare and deliver Lore CLI 0.2.0 release metadata without publishing, then qualify and publish 0.2.0 only through a separately approved publication path.
- Confirmed by the user: "proceed with the safe next steps" on 2026-08-09, accepting the previously proposed safe sequence.
- Rationale: close authoritative Backlog residue before deriving release notes; keep reversible metadata preparation separate from immutable tag, registry, and GitHub Release actions.
- Order is a tie-break; readiness is recomputed live.
- Execution model: sequential waves of one task because parent settlement, version/changelog changes, generated evidence, documentation, and release delivery share Backlog and release surfaces. No subagents are authorized.
- Authorization boundary: on 2026-08-09 the user approved the delivery model for wave 2 via "delivery model approved". This authorized LCLI-320 metadata/documentation preparation, commits, pushes, protected pull requests through dev and main, required CI observation, and safe pruning of temporary preparation refs.
- Manual publication authorization: on 2026-08-09 the user explicitly said "authorize manual publication". This dispatches LCLI-321 wave 3 and authorizes the immutable v0.2.0 tag, a Release publish:false qualification dispatch, manual npm publication from the exact retained artifacts, anonymous verification, GitHub Release creation, and protected settlement. Release publish:true remains prohibited while LCLI-278 is open and the live release Environment is unprotected.

## Frontier
Informational snapshot only; never a promised next wave.

- LCLI-314 and LCLI-320 are Done after sequential waves 1 and 2.
- LCLI-321 is In Progress as sequential wave 3 under explicit manual-publication authorization. Exact-main CI passed, v0.2.0 is tagged at that commit, and publish:false qualification retained the exact seven-package artifact set.
- Release publish:true remains prohibited while LCLI-278 is open and the release Environment lacks an effective external approval control.
- Manual npm publication is execution-blocked only on owner authentication: the attempted browser login did not complete and npm remains unauthenticated. The retained GitHub artifact expires 2026-11-07 and the downloaded untouched tarballs remain in a private temporary directory for immediate resume.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-314 | OKF 0.2 parent closeout | none | Done | 1 | Backlog task record; supporting OKF conformance evidence | All four aggregate criteria verified; six subtasks remain Done and delivered. |
| 2 | LCLI-320 | 0.2.0 metadata preparation | LCLI-314 | Done | 2 | package.json, bun.lock, six npm platform manifests, CHANGELOG.md, version-derived benchmark fixtures, release-facing docs and tests | Delivered through protected dev and main with two eight-check CI passes; no tag or publication. |
| 3 | LCLI-321 | Immutable 0.2.0 publication | LCLI-320 | In Progress | 3 | release truth, release Story, runbook if facts change, Backlog settlement | AC#1-#3 complete: exact-main CI, tag, authorization, and publish:false qualification are proven. Restore npm owner authentication, then publish six platform artifacts before root and complete AC#4-#6. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-314 | 2026-08-09 / wave 1 | Done with all 4 aggregate criteria checked. Six subtasks are live Done with zero unchecked criteria and final summaries; focused aggregate suite passed 435 tests, adversarial 0.1/0.2 slice passed 10 tests, strict Lore validation/check passed, delivered head 995b51e is an ancestor of current dev, and diff hygiene passed. Parent closeout changed only Backlog campaign records. |
| LCLI-320 | 2026-08-09 / wave 2 | Done with all 6 criteria checked. Seven manifests and six pins agree on 0.2.0; the frozen lockfile, dated changelog, deterministic fixtures, Story coupling, and 0.1.1 release-truth boundary are coherent. Local qualification passed 2553 tests with 1 platform skip, focused suites, typecheck/lint/build, compiled version smoke, strict Lore gates, zero-vulnerability audit, diff hygiene, and seven npm dry-runs. Exact head 8f3bc92 passed all 8 checks and merged through PR #343 to dev as 2ed1a2b; exact dev head passed all 8 checks again and merged through PR #344 to main as e60509b. The temporary preparation branch was pruned locally and remotely. No tag, dispatch, package publication, or GitHub Release occurred. |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: requires a repository-admin/security decision and effective out-of-file release approval control; automated publish:true remains prohibited.
- LCLI-315 and LCLI-315.4: outside this release scope. The completed tracker foundation remains delivered; Quest remains externally blocked by the public registry E404 verified on 2026-08-09.
- LCLI-42: explicitly on hold.
- LCLI-43, LCLI-44, and LCLI-45: explicitly deferred.
- Completed historical release and remediation tasks: outside the new campaign.

## Wave log
- 2026-08-09 — wave 3 qualification checkpoint. Full CI run 31317080475 passed all nine jobs on exact main SHA eb03eb2adcb7b391289955a5bdf5ba4b6f841017. Lightweight v0.2.0 resolves directly to that commit. Release run 31317296988 used publish=false, passed every blocking gate and six matching-host package qualifications, skipped the optional scale observation and OIDC publish job, and retained npm-packages artifact 9039171783: exactly seven untouched 0.2.0 tarballs, archive digest sha256:8abb10f32b5dfd3917817ae1e26c113515d1f63826c3c209fe1cdaa62dba4f58, expiring 2026-11-07. AC#1-#3 are checked. All seven registry versions still returned E404 before qualification. The only immediate blocker is npm owner authentication; a browser login attempt did not complete and was canceled without collecting credentials.
- 2026-08-09 — dispatched sequential wave 3 for LCLI-321 after the user explicitly authorized manual publication. Live preflight confirmed v0.2.0 has no tag or GitHub Release, the release Environment still has zero protection rules and no deployment policy, and publish:true remains prohibited. The exact current main settlement commit lacks a push CI run because it changed only ignored documentation/Backlog paths, so a manual full-matrix CI dispatch is required before tagging. npm whoami returns E401, so registry mutation will wait for restored owner authentication; qualification may proceed independently.
- 2026-08-09 — settled sequential wave 2. LCLI-320 is Done with all six criteria checked after 2553 passing tests, two focused suites, full static/build/Lore/audit/dry-run qualification, and adversarial self-review. PR #343 exact head 8f3bc921 passed all eight required checks and merged to dev as 2ed1a2b10; PR #344 exact dev head passed all eight required checks and merged to main as e60509b68. Verified protected-branch ancestry before pruning the exact temporary preparation refs. No v0.2.0 tag, Release dispatch, npm publication, GitHub Release, or LCLI-321 execution occurred. LCLI-321 is now formally dependency-ready but remains human-decision-blocked and undispatched.
- 2026-08-09 — dispatched sequential wave 2 for LCLI-320 after restore grounding found no drift: dev remained at ffc1af59a96b2426364666df002294d79b383c93, equal to locally known origin/dev; only four intentional Backlog campaign paths were dirty; one worktree and no campaign branch existed. The user approved the delivery model, authorizing reversible 0.2.0 preparation plus protected delivery through dev and main. Tags, workflow dispatches, npm publication, GitHub Release creation, and LCLI-321 remained unauthorized.
- 2026-08-09 — settled wave 1. LCLI-314 is Done with all four aggregate criteria checked after 435 focused tests, a 10-test targeted 0.1/0.2 compatibility slice, strict Lore validation/check, delivery-ancestry verification, and adversarial self-review. LCLI-320 became dependency-ready but remained undispatched because that restore authorized only the parent-closeout wave.
- 2026-08-09 — restore grounding matched the active handover: dev remained at ffc1af59a96b2426364666df002294d79b383c93, equal to locally known origin/dev at 0 behind / 0 ahead; only the three intentional untracked campaign records were dirty; one worktree and no campaign branches existed. All six LCLI-314 subtasks were live Done with zero unchecked criteria and final summaries. Dispatched LCLI-314 as sequential wave 1 for aggregate parent closeout.
- 2026-08-09 — initialized doc-16 after the user confirmed the proposed safe next steps. Created LCLI-320 for reversible 0.2.0 metadata preparation and LCLI-321 for separately gated publication. Grounded against clean dev at ffc1af59a96b2426364666df002294d79b383c93, equal to locally known origin/dev at 0 behind / 0 ahead, with one registered worktree and zero In Progress tasks.
