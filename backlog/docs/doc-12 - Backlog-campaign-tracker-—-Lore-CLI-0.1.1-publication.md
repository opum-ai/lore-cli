---
id: doc-12
title: Backlog campaign tracker — Lore CLI 0.1.1 publication
type: other
created_date: '2026-08-04 21:05'
updated_date: '2026-08-04 21:05'
---
# Backlog campaign tracker — Lore CLI 0.1.1 publication

## Scope and order confirmation
- Scope: publish Lore CLI 0.1.1 from the exact verified main commit, including the first Windows ARM64 package, public registry/install verification, GitHub Release creation, and release-truth settlement.
- Confirmed by the user: approved - shipp 0.1.1 on 2026-08-04.
- Confirmed order: LCLI-313 is the single sequential publication task.
- Order is a tie-break; readiness is recomputed live.
- Authorization: tag, push, qualify, interactively publish exact artifacts, configure package trust, create the GitHub Release, deliver documentation, and prune temporary release state. Release publish:true remains prohibited by LCLI-278.

## Frontier
Informational snapshot only; never a promised next wave.

- Ready now: none; LCLI-313 is in flight.
- In flight: LCLI-313.
- Resolved in this campaign: none.
- External constraint: the local npm session is currently unauthenticated and must be re-established before interactive publication.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-313 | immutable npm 0.1.1 publication | none | In Progress | 1 | release truth, release runbook, Story/log, Backlog settlement | Use publish:false qualification and exact artifacts; never use publish:true while LCLI-278 is open. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |

## Not queued — blocked, deferred, or human decision required
- LCLI-278 remains outside this release task: the private-repository release Environment has no effective required-reviewer protection, so automated publish:true stays prohibited.

## Wave log
- 2026-08-04 — init and wave 1 dispatch: the user explicitly authorized shipping 0.1.1. Live grounding found clean synchronized main at 58537a71e888b511f216a931089bb88eaa86acd6, absent v0.1.1 tag/release and seven absent registry versions, an unprotected release Environment, and an expired interactive npm session. LCLI-313 entered the single sequential wave on release/0.1.1-publication; qualification may proceed while interactive publication awaits re-authentication.
