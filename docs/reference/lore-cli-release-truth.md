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

As verified on 2026-08-05 UTC, Lore CLI **0.1.1 is released**:

- all seven manifests and the root's six exact optional-dependency pins use
  `0.1.1`; the root bin is the publishable Node launcher `bin/lore.cjs`;
- annotated tag `v0.1.1` resolves through tag object
  `75f61587a734f861fe8d6b06335db4d3d34dd7d2` directly to qualified main
  commit `e7fe3394109830a89fcdf16a675d0636446bcd79`;
- GitHub Actions Release run `30966913181` ran on that tag with
  `publish: false`, passed the bounded Ladybug and concurrency gates, qualified
  all six matching hosts including Windows ARM64, and retained exactly seven
  tarballs in artifact `8915160779`;
- the six platform packages were published interactively first and
  `@opum-ai/lore` was published last, using only those untouched workflow
  tarballs; no local rebuild or repack was used;
- anonymous npm metadata reports `@opum-ai/lore@0.1.1` and all six platform
  packages as public; every registry shasum matched the successful publish
  result and every registry record carries SHA-512 integrity metadata;
- a clean anonymous registry install selected
  `@opum-ai/lore-darwin-arm64@0.1.1`, and the installed `lore --version`
  returned `0.1.1`; and
- the private `opum-ai/lore-cli` repository has a non-draft, non-prerelease
  GitHub Release for `v0.1.1`; keeping the repository private does not affect
  the seven public npm packages; and
- the new `@opum-ai/lore-win32-arm64` package has a GitHub Actions Trusted
  Publisher bound to repository `opum-ai/lore-cli`, workflow `release.yml`,
  Environment `release`, and publish permission, matching the six previously
  verified package relationships.

The exact workflow artifact SHA-256 values were:

| Package | SHA-256 |
|---|---|
| `@opum-ai/lore` | `3b5cfb8cbc67b314229510176fba5e7d95988812e7cd98633e5be6a55c7bd51e` |
| `@opum-ai/lore-darwin-arm64` | `307639e467653e9df4efe6d9b1d490c5540a99d1bcd91da825367fe3f0e2519e` |
| `@opum-ai/lore-darwin-x64` | `c60086a0c7683f8ddfce749792d70b2c6ff656ea0e02214829525f4686c272fa` |
| `@opum-ai/lore-linux-arm64` | `95713cb6ad93530d6e298e0384bd95dd761c794f691f6777fec9b4617625639f` |
| `@opum-ai/lore-linux-x64` | `0f53ce4283e8c87a51759c9984261a432bc43e841132fe13a238975ba9b386cd` |
| `@opum-ai/lore-win32-arm64` | `940238d916ad25bb3130dc5f2c0b97006a1265c75823c75ae9064778d2196b04` |
| `@opum-ai/lore-win32-x64` | `c1e441f77d841b01bd046177e1bd024a4e1caf963c66dfafc1ac3e0fdc211dfb` |

The repository owner explicitly authorized interactive publication of `0.1.1`
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
4. all seven expected npm packages exist at that version;
5. a clean registry install executes and reports that exact version; and
6. the owner gate for that publication path is satisfied. For `0.1.0`, that is
   the recorded authorization for interactive publication; automated releases
   additionally require LCLI-278 to be resolved.

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
- LCLI-296 owns the historical `0.1.0` workflow, registry, Trusted Publisher,
  install, and GitHub Release evidence.
- LCLI-313 owns the `0.1.1` workflow, seven-package registry, install, and
  GitHub Release evidence.
- The [Lore CLI handover](../runbooks/lore-cli-handover.md) routes a fresh
  session to these live sources without copying a task cursor.
