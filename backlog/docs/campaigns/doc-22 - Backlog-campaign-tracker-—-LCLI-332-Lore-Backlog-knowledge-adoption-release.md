---
id: doc-22
title: Backlog campaign tracker — LCLI-332 Lore Backlog knowledge-adoption release
type: other
created_date: '2026-08-16 13:16'
updated_date: '2026-08-16 13:52'
---
# Backlog campaign — LCLI-332 Lore Backlog knowledge-adoption release
## Contract
- Mode: autonomous-docs
- Scope: lore-cli only; LCLI-332 release evidence, delivery preparation, and owner-authorized interactive publication
- Queue rule: dependencies, then priority and ordinal
- Governing authorization: owner authorized 2026-08-16: `0.3.0`, `dev` to `main` promotion, tag, seven public npm packages, GitHub Release, and owner-performed npm 2FA interactive publication. Automated `publish: true` remains prohibited while LCLI-278 is unresolved.
## Repository
| Repository | Task ids | AGENTS authority | Integration base | Required gates |
| --- | --- | --- | --- | --- |
| lore-cli | LCLI-332 | autonomous docs/repository process; owner-authorized release and `main` promotion; no automated publication | `7b043e938205918ba0dc51a37261b81f5176fbba` | release workflow publish:false; immutable artifact evidence; owner 2FA publication; registry/install/GitHub Release evidence |
## Frontier
- Resolved: 0; in flight: 0; blocked: 1; ready: 0. Repository delivery and publish:false qualification are complete. The only blocker is the owner-held external npm 2FA publication of the exact retained artifacts.
## Queue
| Order | Task | Dependencies | State | Wave | Likely paths |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-332 | LCLI-331 (Done) | human-decision blocked | publication | immutable npm tarballs, registry/install evidence, GitHub Release, release-truth docs |
## Resolved
| Task | Wave | Disposition | Evidence pointer |
| --- | --- | --- | --- |
| Release preparation | 1 | Delivered and promoted | PR #383 -> `dev` d8f780d; PR #384 -> `main` 05404f7; tag `v0.3.0` |
| Immutable qualification | 2 | Passed with publish disabled | Release run 31950668955; artifact 9264624493; seven tarballs in `/private/tmp/lcli-332-0.3.0-IXVNsa` |
## Human decisions and blockers
- Required external action: owner authenticates to npm with 2FA and interactively publishes only the seven already-qualified tarballs, platform packages first and `@opum-ai/lore` last. Do not rebuild, repack, retag, or dispatch `publish:true`.
- Retained artifact: `/private/tmp/lcli-332-0.3.0-IXVNsa`, owner `@jeremy`, immutable qualified tarballs downloaded from artifact 9264624493; retain until public metadata, integrity, clean-install, and GitHub Release evidence is recorded.
- Automation constraint retained: LCLI-278 is To Do, so Release `publish:true` remains prohibited.
## Wave log
- Owner authorization, live npm `0.2.0` baseline, and independent release review grounded the `0.3.0` plan.
- LCLI-332 was coupled to `stories/prepare-the-first-lore-cli-release` through authority-gated Lore commands.
- PR #383 passed all required checks after deterministic Ladybug fixture hashes were refreshed for 0.3.0; it merged to dev as d8f780d.
- PR #384 passed all required checks and promoted the exact dev merge to main as 05404f7.
- `v0.3.0` resolves to 05404f7. Release run 31950668955 passed every blocking qualification, matching-host package, acceptance-evidence, and package/install-sanity gate with `publish=false`; OIDC publish was skipped.
- Artifact 9264624493 is unexpired through 2026-11-14; exactly seven tarballs were read-only inventoried in `/private/tmp/lcli-332-0.3.0-IXVNsa`. Publication and public evidence remain the sole owner-held stage.
