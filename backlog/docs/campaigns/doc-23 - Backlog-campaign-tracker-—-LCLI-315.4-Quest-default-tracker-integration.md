---
id: doc-23
title: Backlog campaign tracker — LCLI-315.4 Quest default tracker integration
type: other
created_date: '2026-08-17 15:19'
updated_date: '2026-08-18 06:04'
---
# Backlog campaign — LCLI-315.4 Quest default tracker integration

## Contract
- Mode: autonomous-docs.
- Scope: lore-cli only; qualify the installed Quest artifact, deliver LCLI-315.4 to `dev`, settle the task/tracker, and clean only proved-merged campaign artifacts.
- Quest boundary: do not mutate the Quest repository or publish/install Quest from this campaign.

## Repository
| Repository | Task ids | Integration base | Current branch and HEAD | Required gates |
| --- | --- | --- | --- | --- |
| lore-cli | LCLI-315.4 | `dev` at `e4f491acadf0f2c5f1781e3e6eb320995b9cf60e` | `feat/lcli-315-4-quest-default` at `340a88179a22c525ae5d3fce7cc015ef82f3b3ec` | independent review; delivery gates; `dev` PR/merge |

## Frontier
- Resolved: 0; in flight: 1; blocked: 0; ready: 0.
- LCLI-315.4 has a corrected installed Quest artifact and is awaiting independent review and delivery.

## Queue
| Order | Task | Dependencies | State | Wave | Likely paths |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-315.4 | LCLI-315.1 (Done); QCLI-97.9 (Done) | In progress — reviewed 0.2.7 pin and delivery | resume-6 | adapter, tests, docs, Backlog evidence |

## Installed Quest qualification
- QCLI-97.9 is Done. Its handback records source/lifecycle `5f94475`, artifact `436f4f6`, root tarball SHA-256 `f189a51af13a9ee2f45fc01b2f9de312c6aa36fdb3d6820889a51abbabffb50d`, and Darwin ARM64 tarball SHA-256 `4d95674989908f4248811544b1c8f53d45ee2053bbfc2c550d7f876b6b9d20ce`.
- Active Quest resolves from `/Users/jdnewhouse/.local/bin/quest` to `/Users/jdnewhouse/.local/lib/node_modules/@opum-ai/quest/bin/quest.cjs`, reports `0.2.7`, and is not the retained `/private/tmp` candidate.
- Active launcher SHA-256: `4c4a801394100767f483ef6ab55c944527fb9933060a5fe004e95f4dda860ab2`; active Darwin ARM64 binary SHA-256: `76e86cf02c6aa19ac1da9df4452f24f47bc78c1f397bf68e8e9a9722273e697c`.
- Schema-1 manifest has exact migration entries: preview `migration.backlog-preview` nonmutating; apply `migration.backlog-applied` mutating; status `migration.backlog-status` nonmutating; rollback `migration.backlog-rolled-back` mutating.
- QCLI-97.9 records clean packed-install qualification, actor-free apply/rollback exit-4 denials, preview/apply/LCLI-315.4 alias/status/rollback, and no registry publication.

## Lore evidence
- LCLI-315.4 pins the adapter and regression tests to exact Quest `0.2.7`; a live adapter probe in a disposable initialized Git/Quest workspace returns `{version: 0.2.7, schemaVersion: 1}`.
- Focused Quest adapter/migration tests: 15 pass. Full tests, typecheck, lint, build, strict Lore validate/check, and diff hygiene pass after the pin.
- QCLI-97.5 remains an external Quest task for this Lore adapter. This campaign owns current-repository work only and does not mutate the Quest repository.

## Retained artifacts
| Artifact | Owner | Reason | Cleanup condition |
| --- | --- | --- | --- |
| feature branch at `340a881` plus current LCLI-315.4 changes | LCLI-315.4 campaign | qualified implementation awaiting review/delivery | merge to `dev`, then prove merged |
| modified LCLI-315.4 and doc-23 | LCLI-315.4 campaign | durable campaign evidence | settle after delivery |
| `.gitignore` | user | requested native-binary ignore rules | user decides commit/discard |
| LCLI-339 and LCLI-340 | concurrent external owner | unrelated Backlog dirt | owner commits or removes |
| Quest qualification targets and isolated worktree | LCLI-315.4 campaign | reproducible artifact evidence | delivery proved merged |

## Exceptions
- No Quest mutation, Quest installation, registry publication, Lore PR, merge, task completion, `lore sync`, or cleanup has occurred in this wave.
