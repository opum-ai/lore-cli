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

`0.3.3` is the release candidate for the agent manifest-kind contract repair
(LCLI-350). Its seven package manifests and exact optional-dependency pins are
aligned at `0.3.3`. The authoritative installable candidate family (six
platform binaries plus root/platform tarballs) is built from corrected
source tip `a4322b71df3afaa94e1d1065934513dd34683fa6` and staged immutable at
`/tmp/lore-0.3.3-family-a4322b7`, digested by family manifest v1 with SHA-256
`745628def534bd76375916c9b3ca57ecf967e3b2000ed5edb6047e959ebbc746`. It was
qualified by audit `8a71a8b0ac14473ba15ba02ed449fed3` on lease branch
`settle/release-truth-862a9b6d3b7c` under pinned Bun 1.3.14: lint/typecheck
clean, full suite 2662 pass / 0 fail / 1 skip across 89 files, strict
`lore check`/`validate` over 75 bundle files clean, fresh-prefix install of
the launcher plus host platform tarball self-reports `0.3.3` and its
`agent list --json` emission matches the manifest-declared
`agent.profiles` kind. An earlier staging from pre-fix source
`f299ec8c2e403f921165e84b2cacf12a8f8c5abc` (manifest SHA-256
`d3c45374ae2f8f8641c4b076fd47ecb1446557ccda4ef6b2508afc0e8d90a5ea`) predates
the LCLI-350 fix and is superseded by the staged rebuild; it is retained for
audit trail only. The candidate is not released until a qualified tag,
Release workflow artifact evidence, interactive publication, registry
verification, and clean-install evidence all exist.

Publication of this candidate under the `rc` dist-tag is authorized by the
recorded direct-user order (FMC correlation
`960b5e3be42042628512c1e3e5e7d771`, replacing
`e2343ae664dd45d69b1de178465eaf05`, Controller `opum-doc`), which resolves
the ODOC-63.7 npm credential decision for this exact path: the publication
uses the ambient authenticated npm CLI without reading any credential
material, never touches `latest`/`main`/production, and follows the recorded
RC dist-tag procedure in `docs/runbooks/release-publishing.md` §4. The
accepted order is the recording instrument for the `rc` tag choice — no
earlier repository record names an RC dist-tag. An `rc` publication is a
candidate availability event, not the "released" designation above.

`0.3.2` is the release candidate for the packaged Backlog-isolation repair
(superseded as the active candidate by `0.3.3` above).
Its seven package manifests and exact optional-dependency pins are prepared for
qualification, but it is not released until a qualified main tag, Release
workflow artifact evidence, interactive publication, registry verification,
and clean-install evidence all exist.

`v0.3.1` is an immutable, **unpublished** tag. Its `publish: false` Release
workflow exposed a matching-host package-qualification failure: the fixture
Backlog shim did not honor `BACKLOG_CWD` after Lore isolated its physical cwd.
No `0.3.1` package was published or may be substituted; LCLI-337 fixes that
qualified-path boundary in the successor `0.3.2` candidate.

As verified on 2026-08-16 UTC, Lore CLI **0.3.0 is released**:

- all seven manifests and the root's six exact optional-dependency pins use
  `0.3.0`; the root bin is the publishable Node launcher `bin/lore.cjs`;
- lightweight tag `v0.3.0` resolves directly to qualified main commit
  `05404f7a32a70709d40cea6a648f559089839565`;
- GitHub Actions Release run `31950668955` ran on that tag with
  `publish: false`, passed every blocking release and matching-host gate, and
  retained exactly seven tarballs in artifact `9264624493`;
- the six platform packages were published interactively first and
  `@opum-ai/lore` was published last, using only those untouched workflow
  tarballs; no local rebuild or repack was used;
- anonymous npm metadata reports `@opum-ai/lore@0.3.0` and all six platform
  packages as public; every registry shasum matched the successful publish
  result and every registry record carries SHA-512 integrity metadata;
- a clean anonymous registry install selected
  `@opum-ai/lore-darwin-arm64@0.3.0`, and the installed `lore --version`
  returned `0.3.0`; and
- the private `opum-ai/lore-cli` repository has a non-draft, non-prerelease
  GitHub Release for `v0.3.0`; keeping the repository private does not affect
  the seven public npm packages.

The exact workflow artifact SHA-256 values were:

| Package | SHA-256 |
|---|---|
| `@opum-ai/lore` | `45d718c79721d716a96f3a21f88f822a774211b76ac401acad44424b63bac3ae` |
| `@opum-ai/lore-darwin-arm64` | `92e2a44fd4689323d79e3a711d6d1fd2e952481d8d11d649f31afc4ee7aacb31` |
| `@opum-ai/lore-darwin-x64` | `999eeadea9921528e015ec700b2011af3d412002adb93862f61a12b6062ff1cd` |
| `@opum-ai/lore-linux-arm64` | `2b4f9d867c31afb3e871793eaf392ce0b0851776e2ce3650d79476344110416b` |
| `@opum-ai/lore-linux-x64` | `34977a9b71d6d8a01a4712924606646f64bffb1f31fbdc8bcd7f1bf1dc36177a` |
| `@opum-ai/lore-win32-arm64` | `6270f62178d657a5b48ea34bc194f745b742d888625b335e7fce0be66711eabb` |
| `@opum-ai/lore-win32-x64` | `e9337b94b4c55bcbe12af2bbd25f72a5eaa4602b114b0377085ab5939528be14` |

The repository owner explicitly authorized interactive publication of `0.3.0`
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
- LCLI-321 owns the historical `0.2.0` workflow, seven-package registry,
  install, and GitHub Release evidence.
- LCLI-332 owns the `0.3.0` knowledge-adoption workflow, seven-package
  registry, install, and GitHub Release evidence.
- The [Lore CLI handover](../runbooks/lore-cli-handover.md) routes a fresh
  session to these live sources without copying a task cursor.
