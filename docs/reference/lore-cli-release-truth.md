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

`0.3.5` is **RELEASED**. Published 2026-08-30 from tag `v0.3.5` at
`744d099263b5`, by Release run `33296350640` via npm **OIDC trusted
publishing** — no credential was involved at any point.

Registry evidence, all seven package names at `0.3.5` with `latest` moved:
`@opum-ai/lore`, and `@opum-ai/lore-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}`.
Clean-install smoke from a fresh temporary directory against the real registry:
`npx --yes @opum-ai/lore@0.3.5 --version` returns `0.3.5`.

Why the release exists: published `0.3.4` carried a frozen
`SUPPORTED_QUEST_VERSIONS = [0.2.7, 0.2.8]` and therefore refused the published
Quest `0.2.9`. As observed on 2026-08-28, the two then-current releases of the
pair could not be used together at all — every tracker-touching command exited
6. `0.3.5` replaces that set with `MIN_QUEST_VERSION = 0.2.7` and a `>=`
comparison (ADR-0020), evaluates the gate before persisting a tracker choice,
and stops `lore scaffold mkdocs` generating a `docs/tags.md` that
`lore validate --strict` rejects.

**The tag was MOVED, and that is recorded rather than hidden.** `v0.3.5`
originally pointed at `fda122c`, which could not publish: the release workflow
globbed `dist-npm/*.tgz`, and npm parses a bare relative path containing a slash
as a GitHub shorthand, so every publish resolved to `github:dist-npm/...` and
tried to `git clone` it. That bug had never been seen because `publish: true`
had never run once — LCLI-278 prohibited it from the day the workflow was
written, so the only job that exists solely for release time was never executed.
Moving the tag rather than burning `0.3.6` on a workflow-only fix was safe and
correct: **nothing was ever published under the original tag**, verified against
the registry with all seven names absent at `0.3.5`, so no artifact resolved it.
Tag immutability exists to keep version, tag and shipped bytes consistent, and
moving it restored that rather than breaking it.

Qualification: opum-cli-e2e's 407-row matrix, `402 PASS / 0 FAIL / 0 BLOCKED`
against the quest 0.3.0 candidate bundle, plus the workflow's own six
matching-host platform qualifications carried forward by artifact and
re-verified by digest at assembly.

`0.3.4` is the release candidate for the Quest 0.2.7 structured-criterion
compatibility repair (LCLI-352): the Quest adapter now maps the released
`{index, text, checked}` acceptanceCriteria/definitionOfDone shapes
losslessly and fails loud on any other shape, because published `0.3.3` is
demonstrably incompatible with public Quest 0.2.7 (`lore link` exits 6). Its
family manifests and exact optional-dependency pins are aligned at `0.3.4`.

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

Publication of this candidate under the `release-candidate` dist-tag was
authorized by the recorded direct-user order (FMC correlation
`960b5e3be42042628512c1e3e5e7d771`, replacing
`e2343ae664dd45d69b1de178465eaf05`, Controller `opum-doc`), which resolves
the ODOC-63.7 npm credential decision for this exact path. The accepted
order is the recording instrument for the `release-candidate` tag choice —
no earlier repository record names a candidate dist-tag. A `release-candidate`
publication is a candidate availability event, not the "released"
designation above; it never touches `latest`/`main`/production and follows
the recorded candidate publication procedure in
`docs/runbooks/release-publishing.md` §4.

As verified on 2026-08-27 UTC, Lore CLI **0.3.3 is published as a release
candidate**. The worker session could not complete npm's web-auth step-up
under credential discipline (three bounded `--auth-type=web` windows closed
without auth; exact evidence in LCLI-333), so the repository owner executed
the seven publishes manually from their own authenticated terminal,
platform-first and `@opum-ai/lore` root last, each `--access public --tag
release-candidate`. Independent Controller verification and worker read-only
registry reads agree:

- all seven packages exist at `0.3.3`; every registry shasum and SHA-512
  integrity equals the immutable candidate provenance row;
- fresh registry downloads match the candidate SHA-256 values: root
  `c7180ba1…`, darwin-arm64 `2f6ef049…`, darwin-x64 `5afbf29a…`,
  linux-arm64 `f8ca4131…`, linux-x64 `cca0f8c2…`, win32-arm64 `81371972…`,
  win32-x64 `bd162f43…` (provenance rows for Release run `32926368990`,
  source commit `a4322b71df3afaa94e1d1065934513dd34683fa6`);
- every package carries `release-candidate: 0.3.3` and `latest: 0.3.2` is
  preserved on all seven;
- a clean registry install of `@opum-ai/lore@release-candidate` reports
  `lore --version` 0.3.3, and fresh `lore init --yes --tracker none
  --codex`, `lore validate --strict`, and `lore check --strict` all pass.

This is publication of a candidate, not the "released" designation: the
immutable-tag, workflow-artifact, and GitHub-Release evidence list above
still governs any future release claim for `0.3.3`.

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
