---
id: doc-9
title: Backlog campaign tracker — Lore CLI 0.1.0 publication (round 8)
type: other
created_date: '2026-08-04 01:03'
updated_date: '2026-08-04 01:04'
---
# Backlog campaign tracker — Lore CLI 0.1.0 publication (round 8)

## Scope and order confirmation
- Scope: Finish the unpublished npm-scope migration, qualify and bootstrap-publish Lore CLI 0.1.0 from the private opum-ai/lore-cli repository, verify the public install, create the GitHub release, and configure package-level Trusted Publishers while preserving the unresolved future automated-publish environment gate.
- Confirmed by the user: "we're keeping the repo private for now. proceed as recommended to publish 0.1.0" on 2026-08-03.
- Confirmed order: LCLI-295 package identity migration, then LCLI-296 immutable release and bootstrap publication.
- Order is a tie-break; readiness is recomputed live.

## Frontier
Informational snapshot only; never a promised next wave.

- Ready/in flight: LCLI-295 on chore/lcli-295-opum-ai-npm-scope at base 43da75e40774008034e47d933b5369843cdf0fc4, equal to origin/dev before delivery.
- Blocked by dependency: LCLI-296 depends on LCLI-295.
- Human/security disposition: the repository remains private. The release Environment exists without protection rules; manual 0.1.0 bootstrap publication is explicitly authorized, but future Release publish:true remains blocked by LCLI-278.
- Deferred or on hold: LCLI-42, LCLI-43, LCLI-44, LCLI-45.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-295 | npm identity migration | none | In Progress | 1 | manifests; lockfile; launcher; release workflow; package qualification; tests; README/ECK/CHANGELOG; Lore release docs; Backlog metadata | Finish coupling, verification, delivery, and merge before versioning. |
| 2 | LCLI-296 | immutable 0.1.0 release and npm bootstrap | LCLI-295 | Blocked | pending | six manifests; changelog/release truth/runbook; Story coupling; workflow artifact; tag; GitHub release; npm registry/trust configuration | Publish five platform packages before root from one publish:false artifact. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: remains To Do. The owner chose to keep the GitHub repository private and authorized the manual bootstrap path; no required-reviewer rule or equivalent future publish:true gate is claimed.
- LCLI-42 through LCLI-45: remain explicitly deferred or on hold.

## Wave log
- 2026-08-03 — init/restore: user confirmed the private-repository 0.1.0 publication campaign. Live restore found LCLI-295 In Progress on a dirty isolated branch whose HEAD equals origin/dev, and created LCLI-296 for the dependency-ordered bootstrap release. Read-only GitHub verification found the release Environment exists with zero protection rules, no deployment policy, and administrator bypass enabled. No package, tag, release, or Trusted Publisher was created during initialization.
