---
id: doc-22
title: Backlog campaign tracker — LCLI-332 Lore Backlog knowledge-adoption release
type: other
created_date: '2026-08-16 13:16'
updated_date: '2026-08-16 13:25'
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
| lore-cli | LCLI-332 | autonomous docs/repository process; owner-authorized release and `main` promotion; no automated publication | `7b043e938205918ba0dc51a37261b81f5176fbba` | seven-version consistency; release workflow publish:false; immutable artifact evidence; strict Lore validation/check; diff check; owner 2FA publication |
## Frontier
- Resolved: 0; in flight: 1; blocked: 0; ready: 0. LCLI-332 is active on `release/0.3.0-preparation`; live npm latest is `0.2.0`, and the additive public adoption contract supports the owner-selected `0.3.0` minor release.
## Queue
| Order | Task | Dependencies | State | Wave | Likely paths |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-332 | LCLI-331 (Done) | in progress | 1 | manifests, lockfile, qualification fixture, changelog, generated release evidence |
## Resolved
| Task | Wave | Disposition | Evidence pointer |
| --- | --- | --- | --- |
## Human decisions and blockers
- Owner decision resolved: release scope, target `0.3.0`, owner-authorized interactive publication, and owner identity were confirmed on 2026-08-16.
- Automation constraint retained: LCLI-278 is To Do, so Release `publish:true` remains prohibited; use only the owner-authorized qualified-artifact path.
## Wave log
- Initialized 2026-08-16 against local and `origin/dev` SHA `7b043e938205918ba0dc51a37261b81f5176fbba`.
- LCLI-331 is Done with feature verification at `69ec0bb`; LCLI-332 dependency closure is satisfied.
- Owner authorization, live npm `0.2.0` baseline, and independent release review grounded the `0.3.0` plan.
- LCLI-332 was coupled to `stories/prepare-the-first-lore-cli-release` through authority-gated `lore link`; Backlog back-reference commit `957fa50` is on the preparation branch.
- Metadata preparation is underway; immutable tag, workflow artifacts, publication, registry, and GitHub Release evidence remain pending.
