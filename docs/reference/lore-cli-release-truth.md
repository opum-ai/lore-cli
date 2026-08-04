---
type: Reference
title: Lore CLI release truth
tags:
  - release
  - truth
  - evidence
  - npm
summary: Record the immutable tag, workflow, registry, install, and owner-control evidence for the public Lore CLI release.
timestamp: 2026-08-04T02:50:00Z
---

# Lore CLI release truth

This record distinguishes implemented release mechanics from an actual public
release. The [Release publishing](../runbooks/release-publishing.md) runbook is
a procedure; check this record and its owner evidence before making an
availability claim.

## Details

### Current state

As verified on 2026-08-04 UTC, Lore CLI **0.1.0 is released**:

- all six manifests and the root's five exact optional-dependency pins use
  `0.1.0`; the root bin is the publishable Node launcher `bin/lore.cjs`;
- lightweight tag `v0.1.0` resolves directly to qualified commit
  `e621d209be2cc8867d1c38c7c78b4b4acc96d82e`;
- GitHub Actions Release run `30870431925` ran on that tag with
  `publish: false`, passed the bounded Ladybug and concurrency gates, compiled
  and qualified all five matching hosts, and retained exactly six tarballs;
- the five platform packages were interactively bootstrap-published first and
  `@opum-ai/lore` was published last, using those untouched workflow tarballs;
- npm reports `@opum-ai/lore@0.1.0` and all five platform packages as public;
  each registry shasum matched the successful publish result and each registry
  record carries SHA-512 integrity metadata;
- a clean registry install selected `@opum-ai/lore-darwin-arm64`, and the
  installed `lore --version` returned `0.1.0`;
- the private `opum-ai/lore-cli` repository has a non-draft, non-prerelease
  GitHub Release for `v0.1.0`; keeping the repository private does not affect
  the six public npm packages; and
- every package has a GitHub Actions Trusted Publisher bound to repository
  `opum-ai/lore-cli`, workflow `release.yml`, Environment `release`, and the
  `npm publish` action.

The exact workflow artifact SHA-256 values were:

| Package | SHA-256 |
|---|---|
| `@opum-ai/lore` | `0d7a9ab30afb9c0e52c612355a694823920cebb560c7ba8f88ba5036838a885b` |
| `@opum-ai/lore-darwin-arm64` | `e0b63e7f0a5d3bb3173769e625efc67cb90134bf8330ab0caabbc4c9cfb5d127` |
| `@opum-ai/lore-darwin-x64` | `698621f3b76a4b48862edc9c30beeba972fdb6f3f6ae05235db1db9b8510b325` |
| `@opum-ai/lore-linux-arm64` | `4609256410d7aeb39875d1b19c275cccf846ae2755bac9877bfb54e1ef72c177` |
| `@opum-ai/lore-linux-x64` | `7b4ff9e2ca8c1ae527fbe0a624df6887cba1bc5c52a0f527accf57c88384541c` |
| `@opum-ai/lore-win32-x64` | `3e90fb51ba76fd6c50a0a19bfed8be561dd8a090be51233503e7a562723e5337` |

The repository owner explicitly authorized the one-time interactive bootstrap
while the repository remains private. LCLI-278 remains `To Do`: future
automated `publish: true` dispatches are still prohibited because the
`release` Environment has no effective required-reviewer protection rule.

LCLI-253 is `Done`: Lore now requires the published JSON-capable Backlog.md
release at or past `1.49.0`. That closes the upstream dependency gate but does
not publish Lore itself.

### Evidence required to call Lore released

Treat a Lore version as released only when all of these observations agree:

1. every package manifest and launcher pin uses the same non-placeholder
   version;
2. an immutable Git tag identifies the exact source commit;
3. release workflow evidence identifies the exact artifacts built from that
   commit;
4. all six expected npm packages exist at that version;
5. a clean registry install executes and reports that exact version; and
6. the owner gate for that publication path is satisfied. For `0.1.0`, that is
   the recorded authorization for interactive bootstrap publication; later
   automated releases additionally require LCLI-278 to be resolved.

Planned commands, passing dry runs, package tarballs, an open pull request, or
a release checklist are readiness evidence only. None independently proves
public availability.

### Owner records

- [ADR-0001](../adr/0001-runtime-build-distribution.md) owns the distribution
  architecture.
- [Lore design](../specs/lore-design.md) owns the end-to-end CLI design.
- [Release publishing](../runbooks/release-publishing.md) owns the operating
  procedure.
- LCLI-253 owns the published Backlog.md dependency migration evidence.
- LCLI-278 owns the unresolved repository-administration control.
- LCLI-296 owns the `0.1.0` workflow, registry, Trusted Publisher, install,
  and GitHub Release evidence.
- The [Lore CLI handover](../runbooks/lore-cli-handover.md) routes a fresh
  session to these live sources without copying a task cursor.
