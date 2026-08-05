---
id: doc-12
title: Backlog campaign tracker — Lore CLI 0.1.1 publication
type: other
created_date: '2026-08-04 21:05'
updated_date: '2026-08-05 02:36'
---
# Backlog campaign tracker — Lore CLI 0.1.1 publication

## Scope and order confirmation

- Scope: publish Lore CLI 0.1.1 from the exact verified main commit, including the first Windows ARM64 package, public registry/install verification, GitHub Release creation, and release-truth settlement.
- Confirmed by the user: approved — ship 0.1.1 on 2026-08-04.
- Confirmed order: LCLI-313 was the single sequential publication task.
- Authorization covered tag, push, publish:false qualification, interactive publication of exact artifacts, package trust, GitHub Release creation, documentation settlement, and pruning. Release publish:true remained prohibited by LCLI-278.

## Frontier

Informational snapshot only; never a promised next wave.

- Ready now: none.
- In flight: none.
- Resolved in this campaign: LCLI-313.
- External constraint: LCLI-278 remains open, so automated publish:true is still prohibited.

## Queue

| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-313 | immutable npm 0.1.1 publication | none | Done | 1 | release truth, release runbook, Story/log, Backlog settlement | Published through the authorized interactive path; publish:true was never used. |

## Resolved

| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-313 | 2026-08-05 / wave 1 | Tag v0.1.1 resolves to e7fe3394109830a89fcdf16a675d0636446bcd79. Release run 30966913181 passed all gates and retained seven exact tarballs. All seven npm packages are public with matching shasums and integrity metadata; a clean install reports 0.1.1. The Windows ARM64 Trusted Publisher matches the existing contract, and GitHub Release v0.1.1 is published. |

## Not queued — blocked, deferred, or human decision required

- LCLI-278 remains outside this release task: the private-repository release Environment has no effective required-reviewer protection, so automated publish:true stays prohibited.

## Wave log

- 2026-08-04 — init and wave 1 dispatch: the user explicitly authorized shipping 0.1.1. LCLI-313 entered the single sequential wave; publish:false qualification and interactive publication were required while LCLI-278 remained open.
- 2026-08-05 — wave 1 resolved: after several Windows launcher-capture defects were repaired through protected dev/main CI, exact main commit e7fe3394109830a89fcdf16a675d0636446bcd79 passed post-main CI and Release run 30966913181. Six platform packages were published before the root launcher from untouched artifact 8915160779, anonymous registry/install verification passed, the new Windows ARM64 trust mapping was configured, and GitHub Release v0.1.1 was created.
