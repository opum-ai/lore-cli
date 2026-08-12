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

As verified on 2026-08-12 UTC, Lore CLI **0.2.0 is released**:

- all seven manifests and the root's six exact optional-dependency pins use
  `0.2.0`; the root bin is the publishable Node launcher `bin/lore.cjs`;
- lightweight tag `v0.2.0` resolves directly to qualified main commit
  `eb03eb2adcb7b391289955a5bdf5ba4b6f841017`;
- GitHub Actions Release run `31317296988` ran on that tag with
  `publish: false`, passed every blocking release and matching-host gate, and
  retained exactly seven tarballs in artifact `9039171783`;
- the six platform packages were published interactively first and
  `@opum-ai/lore` was published last, using only those untouched workflow
  tarballs; no local rebuild or repack was used;
- anonymous npm metadata reports `@opum-ai/lore@0.2.0` and all six platform
  packages as public; every registry shasum matched the successful publish
  result and every registry record carries SHA-512 integrity metadata;
- a clean anonymous registry install selected
  `@opum-ai/lore-darwin-arm64@0.2.0`, and the installed `lore --version`
  returned `0.2.0`; and
- the private `opum-ai/lore-cli` repository has a non-draft, non-prerelease
  GitHub Release for `v0.2.0`; keeping the repository private does not affect
  the seven public npm packages.

The exact workflow artifact SHA-256 values were:

| Package | SHA-256 |
|---|---|
| `@opum-ai/lore` | `d5701220ebe60b30f4f686bdee788b81458ff356a97221c0eb0c57796639aae3` |
| `@opum-ai/lore-darwin-arm64` | `66dbe0c2e2c06eb47125a4ddf0aba70186ca49b784b98ab40978f3b41a0976de` |
| `@opum-ai/lore-darwin-x64` | `05ba7c82c17a361e8d6e0dc29c175094e1323553b36d2a74ccd4524506723674` |
| `@opum-ai/lore-linux-arm64` | `0ee0367503a518c01521e32ecdba503a70120e9ccb2765e516aa445c28de4f5c` |
| `@opum-ai/lore-linux-x64` | `11858f4d4b68e199220eb854bc3b4d23342527037a630654ede7671ea716392e` |
| `@opum-ai/lore-win32-arm64` | `25cc92a9813aa92afae90b892034d54b979ff77ce6a21ebd9971c65d7f1536c5` |
| `@opum-ai/lore-win32-x64` | `9b0b6655dbd41b1fda647615d9b10489ecbf01765a1fec72c6b3b19b6204e8eb` |

The repository owner explicitly authorized interactive publication of `0.2.0`
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
- LCLI-321 owns the `0.2.0` workflow, seven-package registry, install, and
  GitHub Release evidence.
- The [Lore CLI handover](../runbooks/lore-cli-handover.md) routes a fresh
  session to these live sources without copying a task cursor.
