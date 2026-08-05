---
id: doc-13
title: Backlog campaign tracker — OKF 0.2 and generated-log portability
type: other
created_date: '2026-08-05 03:22'
updated_date: '2026-08-05 04:40'
---
# Backlog campaign tracker — OKF 0.2 and generated-log portability

## Scope and order confirmation
- Scope: resolve LCLI-316 and deliver the six executable OKF 0.2 subtasks LCLI-314.1 through LCLI-314.6. The LCLI-314 parent remains a non-executable container.
- Confirmed by the user: "leave LCLI-315* out of this campaign" on 2026-08-04, confirming the proposed campaign after removing the entire LCLI-315 initiative.
- Confirmed order: LCLI-316, LCLI-314.1, LCLI-314.2, LCLI-314.3, LCLI-314.4, LCLI-314.5, LCLI-314.6.
- Order is a tie-break; readiness is recomputed live.
- Execution model: sequential waves of one task; no subagents or delivery actions are authorized.

## Frontier
Informational snapshot only; never a promised next wave.

- Ready now by formal dependency state but not dispatched: LCLI-314.1.
- LCLI-314.2 through LCLI-314.6 remain dependency-gated as recorded below.
- Wave 1 is implemented, verified, and settled locally. Its source, test, task, and tracker changes remain on the primary `dev` worktree because commit or other delivery authority was not granted.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-316 | generated log portability | none | Done; verified local state | 1 | src/core/log.ts, test/log.test.ts, test/sync.test.ts | Acceptance criteria complete; awaiting delivery authority. |
| 2 | LCLI-314.1 | OKF version seam | none | Ready | — | src/core/scaffold.ts, src/core/profile.ts, src/core/schema.ts, bundle/check plumbing, tests | Establish version-aware behavior before field migrations. |
| 3 | LCLI-314.2 | OKF generated provenance | LCLI-314.1 | Blocked by dependency | — | profile/template/concept/meta surfaces, tests | Preserve OKF 0.1 and ADR-0011 byte stability. |
| 4 | LCLI-314.3 | OKF sources | LCLI-314.1 | Blocked by dependency | — | profile/template/schema/link/check surfaces, tests, conformance reference | Decide sources participation in the link graph. |
| 5 | LCLI-314.4 | OKF trust and lifecycle | LCLI-314.1 | Blocked by dependency | — | profile/schema/config/reconcile surfaces, tests, ADR | Resolve the lifecycle-status versus task-rollup-status collision explicitly. |
| 6 | LCLI-314.5 | Attested Computation | LCLI-314.1, LCLI-314.4 | Blocked by dependencies | — | profile/schema/template/check surfaces, tests | Representation only; never execute bundle computation. |
| 7 | LCLI-314.6 | OKF conformance closeout | LCLI-314.2, LCLI-314.3, LCLI-314.4 | Blocked by dependencies | — | src/core/schema.ts, check surfaces, docs/reference/okf-conformance.md | Drive docs changes through lore and verify the repository bundle. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-316 | 2026-08-04 / wave 1 | Done with all 3 acceptance criteria checked. Focused suite: 328 pass; lint and typecheck pass; full suite: 2454 pass, 1 skip, 0 fail; `git diff --check` passes. Adversarial self-review verified ordinary subjects remain unchanged and hazardous subjects with multi-backtick runs produce 0 portability warnings. Local changes retained on `dev`; no commit SHA because delivery was not authorized. |

## Not queued — blocked, deferred, or human decision required
- LCLI-315 and all LCLI-315.* subtasks: explicitly excluded by the user from this campaign.
- LCLI-314: parent container; executable acceptance work belongs to the six queued subtasks.
- LCLI-278: repository-admin/release-security decision and external GitHub billing-plan constraint.
- LCLI-42, LCLI-43, LCLI-44, LCLI-45: explicitly deferred or on hold.
- Other terminal tasks: outside the new campaign inventory.

## Wave log
- 2026-08-04 — initialized doc-13 from live Backlog and git state. The user removed the entire LCLI-315 initiative from the proposed scope. Seven tasks were queued in a confirmed sequential order; no wave or implementation started. The checkout was dev at aedf64ae10ba83401d7bc49ab8584337222a3ed1, synchronized with origin/dev, with the new tracker and LCLI-316 task file untracked.
- 2026-08-04 — restore reconciliation found no drift: dev remained at aedf64ae10ba83401d7bc49ab8584337222a3ed1 with origin/dev at 0/0, no extra worktrees or campaign branches, and only the intentional untracked doc-13 and LCLI-316 files. Dispatched LCLI-316 as sequential wave 1; LCLI-314.1 remained ready but undispatched.
- 2026-08-04 — settled wave 1. LCLI-316 is Done with all acceptance criteria checked after focused and full verification. No independent reviewer was authorized, so an adversarial self-review exercised multi-backtick subjects and preserved hand-authored checks. The primary `dev` checkout remains at aedf64ae10ba83401d7bc49ab8584337222a3ed1 (origin/dev 0/0) with modified src/core/log.ts, test/log.test.ts, and test/sync.test.ts plus the untracked doc-13 and LCLI-316 Backlog files. These artifacts are retained intentionally pending delivery authority; no next wave was dispatched.
