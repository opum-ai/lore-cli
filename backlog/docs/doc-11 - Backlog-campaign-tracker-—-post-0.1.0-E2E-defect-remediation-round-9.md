---
id: doc-11
title: Backlog campaign tracker — post-0.1.0 E2E defect remediation (round 9)
type: other
created_date: '2026-08-04 12:54'
updated_date: '2026-08-04 13:17'
---
# Backlog campaign tracker — post-0.1.0 E2E defect remediation (round 9)

## Scope and order confirmation
- Scope: Remediate the six post-0.1.0 defects filed from comprehensive real-binary E2E findings: LCLI-302 through LCLI-307.
- Confirmed by the user: "approved, proceed" on 2026-08-04.
- Confirmed order: LCLI-302 → LCLI-303 → LCLI-305 → LCLI-304 → LCLI-306 → LCLI-307.
- Order is a tie-break; readiness is recomputed live.
- Execution model: sequential single-task waves. The user confirmed scope and order but did not authorize subagents or parallel work, and the queue contains conservative file and behavior conflicts.

## Frontier
Informational snapshot only; never a promised next wave.

- Ready now: LCLI-303, LCLI-305, LCLI-304, LCLI-306, and LCLI-307 remain To Do with no formal dependencies.
- In flight: LCLI-302 in wave 1.
- Resolved in this campaign: none.
- No later wave is promised; readiness will be recomputed after LCLI-302 settles.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-302 | Ladybug native packaging / release | none | In Progress | 1 | `.github/workflows/release.yml`; `benchmark/ladybug/package-qualification.ts`; `src/core/ladybug-native.ts`; `src/cli.ts`; `npm/*`; focused qualification tests | Highest release impact. Native package resolution and compiled-binary diagnostics require real packaged-artifact evidence. |
| 2 | LCLI-303 | Workspace validation / graph runtime | none | Ready | — | `src/core/workspace-projection.ts`; graph command/runtime seams; `test/workspace-retrieval.test.ts`; `test/cli.test.ts` | Must return validation exit 6 whether native Ladybug is active or falling back. Conservatively conflicts with LCLI-302 through shared graph execution. |
| 3 | LCLI-305 | Sync / managed task block drift | none | Ready | — | `src/commands/sync.ts`; `src/core/check.ts`; `src/core/managed-block.ts`; `test/sync.test.ts`; `test/check.test.ts` | Focused 1+ → 0 Story task transition. Establish the narrow managed-block invariant before the broader link repair. |
| 4 | LCLI-304 | Link / unlink / schema capability | none | Ready | — | `src/commands/link.ts`; `src/commands/sync.ts`; `src/core/check.ts`; schema and managed-block seams; `test/link.test.ts`; `test/sync.test.ts`; `test/check.test.ts` | Broader task-coupling validation and reversibility. Conflicts with LCLI-305 and LCLI-306 around sync/check behavior. |
| 5 | LCLI-306 | New / strict validation parity | none | Ready | — | `src/core/check.ts`; `src/core/schema.ts`; `src/core/template.ts`; new/check command seams; `test/check.test.ts`; `test/template.test.ts` | Low-priority CI-gate parity defect; serialize with the shared check cluster. |
| 6 | LCLI-307 | Consumer scaffolding / Obsidian | none | Ready | — | `src/commands/scaffold.ts`; `src/core/consumer-scaffold.ts`; `test/scaffold.test.ts`; `test/consumer-scaffold.test.ts` | Mostly isolated, but retained in the confirmed sequential campaign model. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| — | — | No campaign task has completed. |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: requires a material repository-owner decision about billing, visibility, security controls, and remote Environment configuration.
- LCLI-42: on hold and unscheduled. Its formal dependencies are Done, but explicit reactivation is required.
- LCLI-43: deferred. Its dependency LCLI-28 is Done, but no reactivation decision exists.
- LCLI-44: deferred and formally blocked by non-terminal LCLI-43.
- LCLI-45: deferred despite completed dependency LCLI-9. Its notes require a concrete in-process import need before reactivation.

## Wave log
- 2026-08-04 — init: inventoried every live non-terminal task, verified predecessor states, confirmed the six-task sequential queue with the user, grounded clean `dev` at `405606891a227a9012b87de625d909eba56fec6b` with one worktree and 22 commits ahead of locally known `origin/dev`, and created doc-11. No task was dispatched and no source or remote mutation occurred.
- 2026-08-04 — wave 1 dispatch: restore found the handover, tracker, branch, HEAD, worktree count, live task states, formal dependencies, and exclusion list consistent. The only dirty path is the untracked doc-11 tracker, which does not overlap LCLI-302. Dispatched LCLI-302 sequentially; no later wave is promised.
