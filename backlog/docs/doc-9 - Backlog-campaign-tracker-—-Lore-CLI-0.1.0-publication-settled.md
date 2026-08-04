---
id: doc-9
title: Backlog campaign tracker — Lore CLI 0.1.0 publication (settled)
type: other
created_date: '2026-08-04 01:03'
updated_date: '2026-08-04 03:15'
---
# Backlog campaign tracker — Lore CLI 0.1.0 publication (settled)

## Scope and outcome
- Scope: migrate the npm package family to @opum-ai, qualify and bootstrap-publish Lore CLI 0.1.0 from the private opum-ai/lore-cli repository, verify a public install, create the GitHub Release, and configure all six Trusted Publishers without weakening the unresolved future automated-publish gate.
- User authorization: keep the repository private and proceed with the recommended interactive 0.1.0 bootstrap.
- Outcome: LCLI-295 and LCLI-296 are Done. Lore CLI 0.1.0 is public on npm; the GitHub source repository remains private.
- Residual control: LCLI-278 remains To Do, so future Release publish:true dispatches remain prohibited.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-295 | npm identity migration | none | Done | PR #296 merged the @opum-ai package-family migration before publication. |
| 2 | LCLI-296 | immutable 0.1.0 release and npm bootstrap | LCLI-295 | Done | Six public packages, clean install, GitHub Release, six Trusted Publishers, and synchronized release truth. |

## Release settlement
- Qualified commit: e621d209be2cc8867d1c38c7c78b4b4acc96d82e.
- Tag and release: lightweight v0.1.0 points directly to the qualified commit; the private repository has a non-draft, non-prerelease GitHub Release.
- Workflow evidence: main CI run 30870114161 passed all nine jobs. Release run 30870431925 ran with publish=false, passed all blocking five-host and package gates, skipped OIDC publication, and retained exactly six verified tarballs.
- Registry publication: the five platform packages were interactively published first from the untouched workflow tarballs, then @opum-ai/lore last. All six exact 0.1.0 records are public and their registry shasums and SHA-512 integrity metadata were verified.
- Install evidence: a fresh npm project installed @opum-ai/lore@0.1.0, selected @opum-ai/lore-darwin-arm64, and the installed bin returned 0.1.0.
- Trusted Publishing: npm trust list verified all six relationships use GitHub repository opum-ai/lore-cli, workflow release.yml, Environment release, and createPackage permission.
- Closure gates: 2,431 tests passed with zero failures and 8,093 assertions; lint, typecheck, actionlint, strict Lore validation/check, and diff hygiene passed.

## Not queued — blocked, deferred, or human decision required
- LCLI-278: the release Environment still lacks effective required-reviewer protection for this private repository. The valid npm trust relationships do not authorize a future publish:true dispatch until this task is resolved.
- LCLI-42 through LCLI-45: remain explicitly deferred or on hold.

## Wave log
- 2026-08-04 — publication settlement: all six npm packages became public, the clean install returned 0.1.0, the GitHub Release was created, every Trusted Publisher was configured and listed, LCLI-296 reached Done, and release truth was synchronized.
- 2026-08-03 — immutable qualification: PR #297 merged to dev, PR #298 promoted to main, the full main matrix passed, v0.1.0 was tagged, and Release run 30870431925 produced the six exact artifacts with publish=false.
- 2026-08-03 — wave 1 settlement: LCLI-295 merged through PR #296 before any package, tag, or release mutation.
- 2026-08-03 — init/restore: the user confirmed the private-repository bootstrap campaign and the live restore identified LCLI-278 as the separate future automated-publication gate.
