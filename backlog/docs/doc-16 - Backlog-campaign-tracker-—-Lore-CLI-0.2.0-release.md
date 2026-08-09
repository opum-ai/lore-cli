---
id: doc-16
title: Backlog campaign tracker — Lore CLI 0.2.0 release
type: other
created_date: '2026-08-09 05:47'
updated_date: '2026-08-09 07:46'
---
# Backlog campaign tracker — Lore CLI 0.2.0 release

## Scope and order confirmation
- Scope: reconcile the completed OKF 0.2 parent, prepare and deliver Lore CLI 0.2.0 release metadata without publishing, then qualify and publish 0.2.0 only through a separately approved publication path.
- Confirmed by the user: "proceed with the safe next steps" on 2026-08-09, accepting the previously proposed safe sequence.
- Rationale: close authoritative Backlog residue before deriving release notes; keep reversible metadata preparation separate from immutable tag, registry, and GitHub Release actions.
- Order is a tie-break; readiness is recomputed live.
- Execution model: sequential waves of one task because parent settlement, version/changelog changes, generated evidence, documentation, and release delivery share Backlog and release surfaces. No subagents are authorized.
- Authorization boundary: on 2026-08-09 the user approved the delivery model for wave 2 via "delivery model approved". This authorized LCLI-320 metadata/documentation preparation, commits, pushes, protected pull requests through dev and main, required CI observation, and safe pruning of temporary preparation refs. It did not and does not authorize a v0.2.0 tag, Release workflow dispatch, npm publication, GitHub Release creation, LCLI-321 execution, or any bypass of LCLI-278.

## Frontier
Informational snapshot only; never a promised next wave.

- LCLI-314 and LCLI-320 are Done after sequential waves 1 and 2.
- LCLI-321 has no remaining formal dependency but is not ready-now: it separately awaits an explicit publication-path decision and authorization.
- Release publish:true remains prohibited while LCLI-278 is open and the release Environment lacks an effective external approval control.
- No campaign task is in flight or ready without a new user decision.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-314 | OKF 0.2 parent closeout | none | Done | 1 | Backlog task record; supporting OKF conformance evidence | All four aggregate criteria verified; six subtasks remain Done and delivered. |
| 2 | LCLI-320 | 0.2.0 metadata preparation | LCLI-314 | Done | 2 | package.json, bun.lock, six npm platform manifests, CHANGELOG.md, version-derived benchmark fixtures, release-facing docs and tests | Delivered through protected dev and main with two eight-check CI passes; no tag or publication. |
| 3 | LCLI-321 | Immutable 0.2.0 publication | LCLI-320 | Human-decision-blocked; undispatched | — | release truth, release Story, runbook if facts change, Backlog settlement | Formal dependency is Done. A separately approved publication path is still required; publish:true remains prohibited while LCLI-278 is open. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-314 | 2026-08-09 / wave 1 | Done with all 4 aggregate criteria checked. Six subtasks are live Done with zero unchecked criteria and final summaries; focused aggregate suite passed 435 tests, adversarial 0.1/0.2 slice passed 10 tests, strict Lore validation/check passed, delivered head 995b51e is an ancestor of current dev, and diff hygiene passed. Parent closeout changed only Backlog campaign records. |
| LCLI-320 | 2026-08-09 / wave 2 | Done with all 6 criteria checked. Seven manifests and six pins agree on 0.2.0; the frozen lockfile, dated changelog, deterministic fixtures, Story coupling, and 0.1.1 release-truth boundary are coherent. Local qualification passed 2553 tests with 1 platform skip, focused suites, typecheck/lint/build, compiled version smoke, strict Lore gates, zero-vulnerability audit, diff hygiene, and seven npm dry-runs. Exact head 8f3bc92 passed all 8 checks and merged through PR #343 to dev as 2ed1a2b; exact dev head passed all 8 checks again and merged through PR #344 to main as e60509b. The temporary preparation branch was pruned locally and remotely. No tag, dispatch, package publication, or GitHub Release occurred. |

## Not queued — blocked, deferred, or human decision required
- LCLI-321: formally dependency-ready but requires an explicit publication-path decision and immutable-action authorization before dispatch.
- LCLI-278: requires a repository-admin/security decision and effective out-of-file release approval control; automated publish:true remains prohibited.
- LCLI-315 and LCLI-315.4: outside this release scope. The completed tracker foundation remains delivered; Quest remains externally blocked by the public registry E404 verified on 2026-08-09.
- LCLI-42: explicitly on hold.
- LCLI-43, LCLI-44, and LCLI-45: explicitly deferred.
- Completed historical release and remediation tasks: outside the new campaign.

## Wave log
- 2026-08-09 — settled sequential wave 2. LCLI-320 is Done with all six criteria checked after 2553 passing tests, two focused suites, full static/build/Lore/audit/dry-run qualification, and adversarial self-review. PR #343 exact head 8f3bc921 passed all eight required checks and merged to dev as 2ed1a2b10; PR #344 exact dev head passed all eight required checks and merged to main as e60509b68. Verified protected-branch ancestry before pruning the exact temporary preparation refs. No v0.2.0 tag, Release dispatch, npm publication, GitHub Release, or LCLI-321 execution occurred. LCLI-321 is now formally dependency-ready but remains human-decision-blocked and undispatched.
- 2026-08-09 — dispatched sequential wave 2 for LCLI-320 after restore grounding found no drift: dev remained at ffc1af59a96b2426364666df002294d79b383c93, equal to locally known origin/dev; only four intentional Backlog campaign paths were dirty; one worktree and no campaign branch existed. The user approved the delivery model, authorizing reversible 0.2.0 preparation plus protected delivery through dev and main. Tags, workflow dispatches, npm publication, GitHub Release creation, and LCLI-321 remained unauthorized.
- 2026-08-09 — settled wave 1. LCLI-314 is Done with all four aggregate criteria checked after 435 focused tests, a 10-test targeted 0.1/0.2 compatibility slice, strict Lore validation/check, delivery-ancestry verification, and adversarial self-review. LCLI-320 became dependency-ready but remained undispatched because that restore authorized only the parent-closeout wave.
- 2026-08-09 — restore grounding matched the active handover: dev remained at ffc1af59a96b2426364666df002294d79b383c93, equal to locally known origin/dev at 0 behind / 0 ahead; only the three intentional untracked campaign records were dirty; one worktree and no campaign branches existed. All six LCLI-314 subtasks were live Done with zero unchecked criteria and final summaries. Dispatched LCLI-314 as sequential wave 1 for aggregate parent closeout.
- 2026-08-09 — initialized doc-16 after the user confirmed the proposed safe next steps. Created LCLI-320 for reversible 0.2.0 metadata preparation and LCLI-321 for separately gated publication. Grounded against clean dev at ffc1af59a96b2426364666df002294d79b383c93, equal to locally known origin/dev at 0 behind / 0 ahead, with one registered worktree and zero In Progress tasks.
