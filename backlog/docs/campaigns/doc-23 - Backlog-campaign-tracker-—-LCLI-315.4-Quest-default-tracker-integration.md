---
id: doc-23
title: Backlog campaign tracker — LCLI-315.4 Quest default tracker integration
type: other
created_date: '2026-08-17 15:19'
updated_date: '2026-08-18 06:56'
---
# Backlog campaign — LCLI-315.4 Quest default tracker integration

## Contract
- Scope: lore-cli only; LCLI-315.4 uses the qualified installed Quest 0.2.7 artifact. Do not mutate Quest or publish/install Quest from this campaign.
- Delivery destination: PR #398 to `dev`; repository publication was separately authorized and completed.

## Frontier
- Resolved: 0; in flight: 1; blocked: 0; ready: 0.
- In flight: push CI remediation commit `e6dfd9c`, qualify the fresh PR checks, and merge to `dev` when green.

## Qualified Quest artifact
- QCLI-97.9 source/lifecycle commit: `5f94475`; artifact commit: `436f4f6`.
- Root tarball SHA-256: `f189a51af13a9ee2f45fc01b2f9de312c6aa36fdb3d6820889a51abbabffb50d`.
- Darwin ARM64 tarball SHA-256: `4d95674989908f4248811544b1c8f53d45ee2053bbfc2c550d7f876b6b9d20ce`.
- Active Quest resolves from `~/.local/bin/quest`, reports 0.2.7, and exposes the exact schema-1 preview/apply/status/rollback descriptors. No registry publication is claimed.

## CI diagnosis and remediation
- Repository `opum-ai/lore-cli` is public. Actions run `32105578728` allocated all eight jobs: six passed; Windows tests and Docker E2E failed with actionable logs.
- Windows: production correctly rejected an uninitialized Quest workspace; Bun 1.3.14 on Windows did not expose the synchronously rejected `LoreError` through `rejects.toMatchObject`. The test now captures the rejection and asserts its fields directly.
- Docker: the Backlog-specific harness called bare `lore init`, which now selects Quest for a new bundle. Primary and nested fixtures now pin `--tracker backlog`; mutation probes preserve and restore `.lore/config.toml` so they cannot erase that selection.
- CI remediation commit: `e6dfd9c` on `feat/lcli-315-4-quest-default`.

## Verification
- Focused Quest adapter: 11 pass, 0 fail.
- Docker real-binary E2E: 344 pass, 0 fail.
- Full suite: 2629 pass, 1 intentional skip, 0 fail across 84 files.
- Lint, typecheck, compiled build, `lore validate --strict` (73 files, 0 errors/warnings), `lore check --strict` (73 files, 0 errors/warnings), and `git diff --check` pass.

## Retained artifacts
| Artifact | Owner | Reason | Cleanup condition |
| --- | --- | --- | --- |
| PR #398 and feature branch through `e6dfd9c` | LCLI-315.4 campaign | reviewed Quest delivery plus CI remediation | checks pass and merge to `dev` is proved |
| modified LCLI-315.4 and doc-23 | LCLI-315.4 campaign | durable evidence and settlement state | settle after merge |
| `.gitignore` | user | separate native-binary ignore edit | user decides commit/discard |
| LCLI-339 and LCLI-340 | concurrent external owner | unrelated Backlog dirt | owner commits or removes |

## Next automatic action
- Commit this tracker update, push the branch, monitor PR #398 checks, merge to `dev` when green, verify the integrated tree, settle LCLI-315.4/doc-23, and clean only campaign artifacts proved merged.

## Exceptions
- No Quest repository mutation, Quest installation, registry publication, Lore sync, or unrelated-work cleanup occurred.
