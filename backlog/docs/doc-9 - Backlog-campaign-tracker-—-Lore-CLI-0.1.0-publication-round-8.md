---
id: doc-9
title: Backlog campaign tracker — Lore CLI 0.1.0 publication (round 8)
type: other
created_date: '2026-08-04 01:03'
updated_date: '2026-08-04 02:11'
---
# Backlog campaign tracker — Lore CLI 0.1.0 publication (round 8)

## Scope and order confirmation
- Scope: Finish the npm-scope migration, qualify and bootstrap-publish Lore CLI 0.1.0 from the private opum-ai/lore-cli repository, verify the public install, create the GitHub release, and configure all six Trusted Publishers while preserving the unresolved future automated-publish environment gate.
- Confirmed by the user: "we are keeping the repo private for now. proceed as recommended to publish 0.1.0" on 2026-08-03.
- Confirmed order: LCLI-295 package identity migration, then LCLI-296 immutable release and bootstrap publication.
- Order is a tie-break; readiness is recomputed live.

## Frontier
Informational snapshot only; never a promised next wave.

- In flight: LCLI-296. Release preparation and immutable qualification are complete; bootstrap publication is paused only for browser approval of interactive npm login.
- Resolved: LCLI-295 is Done and delivered through PR #296.
- Human/security disposition: the repository remains private. The release Environment exists without protection rules; manual 0.1.0 bootstrap publication is explicitly authorized, but future Release publish:true remains blocked by LCLI-278.
- Deferred or on hold: LCLI-42, LCLI-43, LCLI-44, LCLI-45.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Note |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-295 | npm identity migration | none | Done | 1 | Delivered through PR #296. |
| 2 | LCLI-296 | immutable 0.1.0 release and npm bootstrap | LCLI-295 | In Progress | 2 | Qualified six exact artifacts; next publish five platform packages before root after npm web login completes. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-295 | 2026-08-03 / wave 1 | Done with all five criteria checked. Local verification passed 25 focused and 2,431 full tests, lint/typecheck/actionlint, six pack dry-runs, strict Lore gates, zero orphans/dangling links, and diff hygiene. PR #296 passed all eight CI jobs and merged exact head 3f9511e95dd39421bec9eee267e0bcd49224f37b into dev as 4a1cda8dadf591ff33e7c27a8ee60a13258254cc before any publication. |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: remains To Do. The owner chose to keep the GitHub repository private and authorized the manual bootstrap path; no required-reviewer rule or equivalent future publish:true gate is claimed.
- LCLI-42 through LCLI-45: remain explicitly deferred or on hold.

## Wave log
- 2026-08-03 — npm authorization pause: all six registry slots were reconfirmed absent. npm 12.0.2 web login is active and waiting for browser approval; no package was published and no credential was recorded.
- 2026-08-03 — immutable qualification: PR #297 passed all eight gates and merged to dev as 89d21386637e586d46658ab556625054f6c1b570. Promotion PR #298 passed all eight gates and merged to main as e621d209be2cc8867d1c38c7c78b4b4acc96d82e; exact main CI run 30870114161 passed all nine push jobs. Tag v0.1.0 resolves directly to that SHA. Release run 30870431925 used publish=false and passed metadata, Ladybug, all five compile, all five matching-host, evidence, package, and install-sanity gates; OIDC publishing was skipped. The retained npm-packages artifact contained exactly six verified tarballs.
- 2026-08-03 — wave 2 dispatch: after PR #296 delivered LCLI-295 and the task reached Done, activated dependency-ready LCLI-296 on release/lcli-296-v0.1.0. Grounding confirmed v0.1.0 and all six npm versions were absent; the candidate set all manifests, pins, and root launcher to 0.1.0. Frozen install, package dry-runs, focused/full tests, lint/typecheck/actionlint, strict Lore gates, zero orphan/dangling checks, and diff hygiene passed.
- 2026-08-03 — wave 1 settlement: LCLI-295 passed local and remote verification and merged through PR #296. No npm publication or release-state mutation occurred.
- 2026-08-03 — init/restore: user confirmed the private-repository 0.1.0 publication campaign. Live restore created LCLI-296 and found the release Environment had zero protection rules. No package, tag, release, or Trusted Publisher was created during initialization.
