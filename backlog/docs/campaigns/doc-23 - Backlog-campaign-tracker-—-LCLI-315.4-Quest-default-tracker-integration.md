---
id: doc-23
title: Backlog campaign tracker — LCLI-315.4 Quest default tracker integration
type: other
created_date: '2026-08-17 15:19'
updated_date: '2026-08-18 12:09'
---
# Backlog campaign — LCLI-315.4 Quest default tracker integration

## Contract
- Scope: lore-cli only; LCLI-315.4 used the qualified installed Quest 0.2.7 artifact. No Quest mutation, install, or publication was authorized.
- Delivery destination: `dev`. Repository publication was separately authorized and completed.

## Frontier
- Resolved: 1; in flight: 0; blocked: 0; ready: 0.
- LCLI-315.4 is Done. PR #398 merged to `dev` as `3964562ffc8947d7639303f2460f88a63c33c5e6`.

## Qualified Quest artifact
- Supported version: 0.2.7; QCLI-97.9 source/lifecycle commit: `5f944755615206daa220e2bc3810e1ad1bbad264`; artifact commit: `436f4f6e5cd41658e456dce6b0a0949023656911`.
- Root tarball SHA-256: `f189a51af13a9ee2f45fc01b2f9de312c6aa36fdb3d6820889a51abbabffb50d`.
- Darwin ARM64 tarball SHA-256: `4d95674989908f4248811544b1c8f53d45ee2053bbfc2c550d7f876b6b9d20ce`.
- Install provenance: `~/.local/bin/quest` resolves to the managed local `@opum-ai/quest` launcher, not the retained `/private/tmp` candidate. Launcher SHA-256: `4c4a801394100767f483ef6ab55c944527fb9933060a5fe004e95f4dda860ab2`; native Darwin ARM64 SHA-256: `76e86cf02c6aa19ac1da9df4452f24f47bc78c1f397bf68e8e9a9722273e697c`.
- Schema 1 commands: `migration.backlog-preview` nonmutating; `migration.backlog-applied` mutating; `migration.backlog-status` nonmutating; `migration.backlog-rolled-back` mutating. No registry publication is claimed.

## Delivered behavior
- New bundles persist Quest explicitly; uninitialized workspaces name `quest init` without mutating.
- Legacy zero-config Backlog bundles use Quest preview/apply/status receipts with actor validation, source identity checks, canonical aliases, and backend persistence only after applied state.
- Explicit Backlog and Jira remain unchanged; missing or incompatible Quest fails without fallback or dual writes.
- CI fixtures pin Backlog where their contract is Backlog-specific. Windows assertions use native paths. Ubuntu retries once only for the exact Bun 1.3.14 `EEXIST ... epoll_ctl` runtime race.

## Verification
- Focused Quest adapter: 11 pass, 0 fail. Full suite: 2629 pass, 1 intentional skip, 0 fail across 84 files.
- Docker real-binary E2E: 344 pass, 0 fail.
- Lint, typecheck, compiled build, `lore validate --strict` and `lore check --strict` (73 files, 0 errors/warnings), and diff hygiene passed.
- Final GitHub Actions run `32111256172`: all eight jobs passed, including Ubuntu, Windows, Docker, browser, compile, both scaffold jobs, and benchmark.

## Retained external state
- Repository: public at `https://github.com/opum-ai/lore-cli`.
- LCLI-339 and LCLI-340 are outside this completed campaign queue and are durably tracked for future work by commit `3c84fca655f1cd8f1d1a1779887bca8e4436bd1e`.
- Clean LCLI-315.4 legacy-boundary, Quest-0.2.2, and integration worktrees were released after ancestry or patch-equivalence proof; their merged local branches and the merged remote integration branch were removed.
- Branch `feat/lcli-315-4-adapter-tests` remains as the recovery artifact for unique commit `8159281316fac86e5318478588975e969b6f5b8a`, touching `src/adapters/quest.ts` and `test/quest-adapter.test.ts`. Owner: campaign coordinator. Cleanup condition: independent review proves the 0.2-era delta is fully superseded or routes any surviving change through normal delivery. Its clean worktree was released.
- Unrelated ODoc worktrees and branches were preserved.
- QCLI-97.5 remains Quest campaign state requiring separate authority for cross-repository work; this completed Lore campaign did not mutate Quest.

## Completion
- Queue empty; task and tracker settled. The active Codex cursor is absent, and both Codex and legacy Claude handover directories pass complete-mode lifecycle audit.
