---
id: doc-22
title: Backlog campaign tracker — LCLI-332 Lore Backlog knowledge-adoption release
type: other
created_date: '2026-08-16 13:16'
updated_date: '2026-08-16 14:36'
---
# Backlog campaign — LCLI-332 Lore Backlog knowledge-adoption release
## Contract
- Mode: autonomous-docs
- Scope: lore-cli only; LCLI-332 release evidence and delivery
- Queue rule: dependencies, then priority and ordinal
- Governing authorization: owner authorized 2026-08-16 the `0.3.0` interactive publication path; automated `publish: true` remains prohibited while LCLI-278 is unresolved.
## Repository
| Repository | Task ids | Integration result | Required gates |
| --- | --- | --- | --- |
| lore-cli | LCLI-332 | PR #383 -> `dev` d8f780d; PR #384 -> `main` 05404f7; tag `v0.3.0` | Release run 31950668955; artifact 9264624493; public registry/integrity; clean install; GitHub Release |
## Frontier
- Resolved: 1; in flight: 0; blocked: 0; ready: 0. LCLI-332 is Done and the release evidence is public.
## Queue
| Order | Task | Dependencies | State | Wave | Likely paths |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-332 | LCLI-331 (Done) | Done | 1-3 | release metadata, immutable artifacts, registry/install/release evidence |
## Resolved
| Task | Wave | Disposition | Evidence pointer |
| --- | --- | --- | --- |
| LCLI-332 | 1-3 | Released and settled | v0.3.0 -> 05404f7; Release 31950668955; artifact 9264624493; npm public; GitHub Release v0.3.0 |
## Human decisions and blockers
- Resolved: owner selected `0.3.0`, authorized interactive publication, and completed npm 2FA publication from the exact qualified tarballs.
- Retained policy: LCLI-278 remains To Do; automated `publish:true` is still prohibited.
## Wave log
- PR #383 delivered preparation to dev after all required checks.
- PR #384 promoted the exact dev merge to main after all required checks.
- `v0.3.0` resolves to 05404f7; Release 31950668955 passed every blocking gate with `publish=false`.
- All six platform tarballs were published before the root launcher; registry SHA-1/SHA-512 values match the qualified tarballs.
- A fresh registry install reported `0.3.0` and exposed `lore backlog adopt`; GitHub Release v0.3.0 is non-draft and non-prerelease.
