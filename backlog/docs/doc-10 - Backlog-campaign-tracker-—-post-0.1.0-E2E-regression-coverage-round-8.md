---
id: doc-10
title: Backlog campaign tracker — post-0.1.0 E2E regression coverage (round 8)
type: other
created_date: '2026-08-04 05:24'
updated_date: '2026-08-04 05:41'
---
# Backlog campaign tracker — post-0.1.0 E2E regression coverage (round 8)

## Scope and order confirmation
- Scope: Add persistent real-binary Docker E2E coverage for the three existing release-readiness gaps LCLI-298, LCLI-299, and LCLI-300.
- Confirmed by the user: "confirmed" on 2026-08-04.
- Confirmed order: LCLI-298 → LCLI-299 → LCLI-300.
- Order is a tie-break; readiness and conflicts are recomputed live before every wave.
- Execution model: sequential single-task waves because all three tasks are expected to modify the shared Docker E2E harness.

## Frontier
Informational snapshot only; never a promised next wave.

- Formally ready: LCLI-298, LCLI-299, and LCLI-300; all formal dependencies are Done.
- Dispatchable after this tracker settlement: LCLI-298. The pre-existing LCLI-297/LCLI-301 implementation is preserved in local commit 10ecee2, so it no longer dirties or file-conflicts with the campaign checkout.
- In flight: none. Cleanup settled pre-campaign residue only and did not dispatch a queued task.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-298 | Docker E2E / agent initialization | LCLI-281 (Done) | To Do; ready after settlement | — | docker/e2e/run-e2e.sh; possibly Docker E2E fixtures or Dockerfile | High priority. Cover Codex and Claude setup, idempotence, managed-block refresh, and prose preservation using the real binary. |
| 2 | LCLI-299 | Docker E2E / validation and schema | none | To Do; ready but ordered after LCLI-298 | — | docker/e2e/run-e2e.sh | Cover validate --type and schema export --type/--out. Shares the harness with every queued task. |
| 3 | LCLI-300 | Docker E2E / regression backports | LCLI-261 (Done), LCLI-262 (Done) | To Do; ready but ordered after LCLI-299 | — | docker/e2e/run-e2e.sh | Persist parent/subtask orphan behavior and rewrite-link text-mismatch warnings for supersede and rename. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| Pre-campaign LCLI-297/LCLI-301 residue | 2026-08-04 / cleanup | Verified and committed locally as 10ecee2. The commit contains Windows ARM64 packaging plus script-free Ladybug installation changes. Verification passed 2,434 tests, typecheck, lint, actionlint, strict Lore validation/check, focused patch/package tests, and staged diff hygiene. No push, PR, merge, publication, or remote mutation occurred. |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: requires a material billing, visibility, security-control, and repository-administration decision plus remote configuration.
- LCLI-42: explicitly on hold and unscheduled; dependencies LCLI-21 and LCLI-28 are Done, but explicit reactivation is required.
- LCLI-43: explicitly deferred; dependency LCLI-28 is Done, but no reactivation decision exists.
- LCLI-44: explicitly deferred and formally blocked by non-terminal LCLI-43.
- LCLI-45: explicitly deferred despite completed dependency LCLI-9; its live notes require a concrete in-process import need before reconsideration.
- LCLI-297 and LCLI-301: Done and preserved in local commit 10ecee2. They remain outside the campaign queue and have no uncommitted checkout residue.

## Wave log
- 2026-08-04 — cleanup settlement: after explicit user approval, restored doc-10 and classified every dirty path as the completed LCLI-297/LCLI-301 implementation or the campaign tracker. Reverified 2,434 tests, typecheck, lint, actionlint, strict Lore validation/check, and diff hygiene; staged only implementation paths; corrected one trailing-space line exposed in the previously untracked dependency patch; proved the adjusted patch reverse-applies; and reran 15 focused Ladybug package tests. Committed the implementation locally as 10ecee2. No queued task was dispatched and no push, PR, merge, publication, cleanup outside the confirmed residue, or remote-state mutation occurred.
- 2026-08-04 — init: inventoried all eight live non-terminal tasks through Backlog JSON views and reconciled prior campaign documents. The user confirmed the sequential LCLI-298 → LCLI-299 → LCLI-300 scope. Grounding found dev at 96dad749834c7fa45cb0554e70c2b34d5a7d4c8d, six commits ahead of locally known origin/dev, one worktree, and broad pre-existing dirty LCLI-297/LCLI-301 release changes. Created tracker doc-10. No task was dispatched or mutated; no source edit, commit, push, PR, merge, publication, branch cleanup, or remote-state action occurred.
