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

`0.4.4` is **RELEASED**. Published 2026-09-05 from tag `v0.4.4` at
`f7bc26769e795bed74e88547856ea09523d8c2d5`, by Release run `33988678882` via npm
**OIDC trusted publishing** — no credential was involved at any point, dispatched
directly with `publish: true` (no separate `publish: false` dry-run; its own job
list — `assert release package versions + metadata are consistent`, every
Ladybug qualification, all six matching-host package qualifications, and
`publish (npm, OIDC trusted publishing)` — ran and passed in the one dispatch).
Promoted `dev` to `main` with a local fast-forward push (`git push origin
dev:main`, not the merge button), confirmed by `git rev-parse` equality on both
refs before tagging; a promotion PR (#593, `dev` into `main`) ran the full
`main`-triggered CI matrix against `f7bc267` and all 9 checks passed before the
fast-forward and tag.

Registry evidence, all seven package names at `0.4.4` with `latest` moved,
verified directly against `registry.npmjs.org` (not the local npm CLI cache):
`@opum-ai/lore`, and
`@opum-ai/lore-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}`.
Clean-install smoke from a fresh temporary directory against the real registry:
`npm install @opum-ai/lore@0.4.4` followed by `lore --version` returns `0.4.4`.

**`@opum-ai/lore-linux-arm64` was again briefly unreadable after a successful
publish — the identical benign pattern `0.4.0` through `0.4.3` all recorded,
not a recurrence worth escalating a fifth time.** Its publish step printed
npm's own success confirmation (`+ @opum-ai/lore-linux-arm64@0.4.4`, verified
directly in the job log); the registry API reported `0.4.3` as `latest` for
that package alone on the first poll, then resolved to `0.4.4` on the second
(~15 seconds later). Verified via the registry API directly rather than
assumed.

**`.claude-plugin/plugin.json`'s `version` matches at the tag: `0.4.4`**,
verified with `git show v0.4.4:.claude-plugin/plugin.json` — the first release
to carry this (LCLI-447 AC#3). `0.4.3` shipped without it: the marketplace pin
moving to `v0.4.3` still resolved as `0.4.2` in every installed copy, because
Claude Code's plugin-update resolution reads `plugin.json`'s own version, not
the git tag. `test/plugin-manifest.test.ts` now fails on every PR the moment
the two disagree, and the release-publishing runbook's version-bump checklist
bumps `plugin.json` alongside the other seven manifests going forward.

Why the release exists: to unblock opum-agent's own profile fix (a qualified
reference pinning its own repository's docs, which crashed uncaught when
compiled bare on `0.4.3` — LCLI-449) without waiting for a larger release, and
to prove LCLI-447's plugin.json fix at a real tag rather than leaving it
theoretical until the next unrelated release. `lore agent context <profile>
--workspace <manifest> --repository <member-id>` compiles a profile-bounded,
provenance-stamped evidence pack across an explicit workspace manifest
(PLAN.md §4.6; LCLI-432) — reference expansion, strict-pinned/relaxed-sources
semantics, and the OPAG-33 tolerant-load path (a member that cannot load is
skipped and reported, not fatal) are all covered by real compiles against
opum-agent's actual `orchestration` profile and opum-doc's actual
`opum-family.json` manifest during development, which is how LCLI-448 (the
skipped-members banner reporting on unrequested members) and LCLI-449 (the
bare-mode crash) were found — dogfooding against real data, not only the test
suite. See CHANGELOG.md's `[0.4.4]` entry for the full list.

Pre-publish gate: `lore check` on this repository's own bundle, built from the
release commit, was clean — 77 files, 0 errors, 0 warnings. Full test suite
2855 pass, 1 skip (pre-existing), 0 fail; typecheck and lint both clean.

**Publish authorization note.** LCLI-278 (no required-reviewer protection on
the `release` GitHub Environment) remains `To Do`. This release proceeded on
the repository owner's direct, explicit authorization (asked via
`AskUserQuestion`: "Cut 0.4.4 now" vs. "wait for a larger release"; the owner
chose "Cut 0.4.4 now") — consistent with the standing practice recorded in
README.md ("the owner lifted the `publish: true` prohibition on 2026-08-29")
and with how `0.3.5`/`0.4.0`/`0.4.1`/`0.4.2`/`0.4.3` actually shipped. LCLI-278
itself has not been resolved or closed; the note there flags that the task
record and the actual practice have diverged.

`0.4.3` is **RELEASED**. Published 2026-09-05 from tag `v0.4.3` at
`2378da56658e8b696f9da4488b56954cb8b1d5a1`, by Release run `33982343746` via npm
**OIDC trusted publishing** — no credential was involved at any point, dispatched
directly with `publish: true` (no separate `publish: false` dry-run; its own job
list — `assert release package versions + metadata are consistent`, every
Ladybug qualification, all six matching-host package qualifications, and
`publish (npm, OIDC trusted publishing)` — ran and passed in the one dispatch).
Promoted `dev` to `main` with a local fast-forward push (`git push origin
dev:main`, not the merge button), confirmed by `git rev-parse` equality on both
refs before tagging; a promotion PR (#583, `dev` into `main`) ran the full
`main`-triggered CI matrix against `2378da5` and all 9 checks passed before the
fast-forward and tag.

Registry evidence, all seven package names at `0.4.3` with `latest` moved,
verified directly against `registry.npmjs.org` (not the local npm CLI cache):
`@opum-ai/lore`, and
`@opum-ai/lore-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}`.
Clean-install smoke from a fresh temporary directory against the real registry:
`npm install @opum-ai/lore@0.4.3` followed by `lore --version` returns `0.4.3`.

**`@opum-ai/lore-linux-arm64` was again briefly unreadable after a successful
publish — the identical benign pattern `0.4.0`, `0.4.1`, and `0.4.2` all
recorded, not a recurrence worth escalating a fourth time.** Its publish step
printed npm's own success confirmation (`+ @opum-ai/lore-linux-arm64@0.4.3`,
verified directly in the job log); the registry API reported `0.4.2` as
`latest` for that package alone across the first five 15-second polls, then
resolved to `0.4.3` on the sixth. Verified via the registry API directly
rather than assumed.

Why the release exists: to unblock four other fleet repositories
(quest-cli, opum-cli-e2e, opum-agent, opum-doc) from flipping their own
per-repo `.claude/skills/lore/SKILL.md` copy to the `opum-lore` marketplace
plugin and deleting it, per opum-agent's OPAG-41 sequencing — user-approved
2026-09-05. `[agents].skill_source` (`"repo"`|`"plugin"`, default unchanged) in
`.lore/config.toml`, plus `lore init --skill-source <repo|plugin>` to persist
it, lets a repository opt the `opum-lore` plugin into owning that file instead
(LCLI-443). Under `"plugin"`, `lore agents`/`lore agents --check` stop
writing/proposing the file and flag a leftover as `orphaned` drift (exit 6
under `--check`); `--force` removes it only on an exact byte match. This
repository dogfooded the opt-in on itself and found (and fixed) a real gap:
`CLAUDE.md`'s generated nudge pointed at the per-repo SKILL.md path
unconditionally, so after this repo's own file was removed the nudge named a
path that must not exist — it now names the plugin instead when
`skill_source` is `"plugin"` (LCLI-444). See CHANGELOG.md's `[0.4.3]` entry
for the full list.

Pre-publish gate: `lore check` on this repository's own bundle, built from the
release commit, was clean — 77 files, 0 errors, 0 warnings. Full test suite
2839 pass, 1 skip (pre-existing), 0 fail; typecheck and lint both clean.

**Publish authorization note.** LCLI-278 (no required-reviewer protection on
the `release` GitHub Environment) remains `To Do`. This release proceeded on
the repository owner's direct, explicit authorization (asked via
`AskUserQuestion`: "Cut 0.4.3 now" vs. "wait for a larger release"; the owner
chose "Cut 0.4.3 now") — consistent with the standing practice recorded in
README.md ("the owner lifted the `publish: true` prohibition on 2026-08-29")
and with how `0.3.5`/`0.4.0`/`0.4.1`/`0.4.2` actually shipped. LCLI-278 itself
has not been resolved or closed; the note there flags that the task record and
the actual practice have diverged.

`0.4.2` is **RELEASED**. Published 2026-09-05 from tag `v0.4.2` at
`c2f3a93f51a5bf6394bdfa8d0b59b5b7a7c4ca2c`, by Release run `33956309104` via npm
**OIDC trusted publishing** — no credential was involved at any point, dispatched
directly with `publish: true` (no separate `publish: false` dry-run this time;
its own job list — `assert release package versions + metadata are consistent`,
every Ladybug qualification, all six matching-host package qualifications, and
`publish (npm, OIDC trusted publishing)` — ran and passed in the one dispatch).
Promoted `dev` to `main` with a local fast-forward push (`git push origin
dev:main`, not the merge button), confirmed by `git rev-parse` equality on both
refs before tagging; the full `main` CI matrix passed on `c2f3a93` before the
tag was pushed.

Registry evidence, all seven package names at `0.4.2` with `latest` moved,
verified directly against `registry.npmjs.org` (not the local npm CLI cache):
`@opum-ai/lore`, and
`@opum-ai/lore-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}`.
Clean-install smoke from a fresh temporary directory against the real registry:
`npx --yes @opum-ai/lore@0.4.2 --version` returns `0.4.2`.

**`@opum-ai/lore-linux-arm64` was again briefly unreadable after a successful
publish — the identical benign pattern `0.4.0` and `0.4.1` both recorded, not a
recurrence worth escalating a third time.** Its publish step printed npm's own
success confirmation (`+ @opum-ai/lore-linux-arm64@0.4.2`, verified directly in
the job log); the registry API reported `0.4.1` as `latest` for that package
alone on the first poll, then resolved to `0.4.2` on the very next poll 30
seconds later. Verified via the registry API directly rather than assumed.

Why the release exists: three changes landed together rather than waiting for
routine cadence, because the wizard-default change is user-visible in a
published CLI and the tracker-path fix affects every Quest-backed
`link`/`unlink`/`rename` call. `lore init`'s interactive wizard now defaults to
setting up one agent harness instead of both when both Claude Code and Codex
are detected (LCLI-442) — Enter-Enter used to select both bridges, and an
explicit "yes" to the second question still does. `lore link`/`unlink`/`rename`
no longer fail (exit 6) after already mutating both the Story doc and the Quest
task record: Quest's own storage-location metadata (`BacklogTaskDetail.file`,
wanted since `0.4.1`'s hyperlink fix) was being misread as a path lore itself
needed to `git commit`, which is only ever true for the `backlog` tracker
(LCLI-433). `lore agents --check` no longer proposes an uninvited Claude bridge
on a Codex-only repository (LCLI-442, `hasClaudeBridge` symmetric to the
existing `hasCodexBridge`). The `opum-lore` Claude Code plugin — the `lore`
skill distributed from this same repository and tag, so a skill can never
describe a CLI version you don't have — ships for the first time (LCLI-441).
See CHANGELOG.md's `[0.4.2]` entry for the full list.

Pre-publish gate: `lore check` on this repository's own bundle, built from the
release commit, was clean — 76 files, 0 errors, 0 warnings. Full test suite
2823 pass, 1 skip (pre-existing), 0 fail; typecheck and lint both clean.

**Publish authorization note.** LCLI-278 (no required-reviewer protection on
the `release` GitHub Environment) remains `To Do`, and a live API check at
release time confirmed the Environment still has `protection_rules: []`. This
release proceeded on the repository owner's direct, explicit authorization —
consistent with the standing practice recorded in README.md ("the owner lifted
the `publish: true` prohibition on 2026-08-29") and with how `0.3.5`/`0.4.0`/
`0.4.1` actually shipped, confirmed by inspecting `0.4.1`'s own run job list
rather than assuming the runbook's `publish: false`-plus-manual-script
description (written for the pre-lift state) still applies. LCLI-278 itself
has not been resolved or closed; the note there flags that the task record and
the actual practice have diverged.

`0.4.1` is **RELEASED**. Published 2026-09-04 from tag `v0.4.1` at
`9918ff9a6579`, by Release run `33841292219` via npm **OIDC trusted
publishing** — no credential was involved at any point, preceded by a
`publish: false` dry-run (Release run `33840645956`) whose `assert release
package versions + metadata are consistent` job passed, confirming the
hand-edited seven-file version bump before any registry write. Promoted
`dev` to `main` by PR #558, landed with a local fast-forward push (`git
push origin dev:main`, not the merge button) so `main` picked up no merge
commit; the full `main` CI matrix (including the push-only macOS job)
passed on `9918ff9` before tagging.

Registry evidence, all seven package names at `0.4.1` with `latest` moved,
verified directly against `registry.npmjs.org` (not the local npm CLI
cache): `@opum-ai/lore`, and
`@opum-ai/lore-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}`.
Clean-install smoke from a fresh temporary directory against the real
registry: `npx --yes @opum-ai/lore@0.4.1 --version` returns `0.4.1`.

**`@opum-ai/lore-linux-arm64` was again briefly unreadable after a
successful publish — the identical benign pattern `0.4.0` recorded, not a
recurrence worth escalating.** Its publish step printed npm's own success
confirmation (`+ @opum-ai/lore-linux-arm64@0.4.1`); the registry API
reported no `0.4.1` version for that package alone for about two and a
half minutes (five 30-second polls) while the other six resolved
immediately, then it resolved. Verified via the registry API directly
rather than assumed.

Why the release exists, and why as a same-night patch rather than routine
cadence: published `quest@0.3.2` started emitting a `path` field on task
records that `0.4.0`'s managed-`<!-- lore:tasks -->`-block renderer had
been waiting on, and surfaced a bug the field's prior absence had been
masking. `renderRow` linked every task row through `links.ts`'s
`normalizeLink`, whose contract unconditionally coerces any target to a
canonical `.md` suffix — correct for OKF concept cross-links, a no-op for
Backlog's already-`.md` task files, but destructive against a Quest task's
real `.quest/tasks/<id>.json` path, corrupting it into a dead
`…LCLI-1.json.md` link. Reproduced directly against both real published
binaries (installed `@opum-ai/lore@0.4.0` against a real Quest workspace)
before deciding this was release-worthy tonight rather than on normal
cadence: the published `0.4.0`+`0.3.2` pairing is the DEFAULT outcome for
anyone installing today, not an edge case, and the corruption is silent —
a link that looks real until followed — which is worse than the missing-
link state it replaced. Fixed by adding `normalizeFileLink`
(`src/core/links.ts`): identical relative-path/URL-encoding computation,
without the suffix coercion, since a `ManagedTaskRow.file` is always
already a concrete on-disk path, never a bare concept id (LCLI-428). See
CHANGELOG.md's `[0.4.1]` entry.

Pre-publish gate: `lore check` on this repository's own bundle, built from
the release commit, was clean — 76 files, 0 errors, 0 warnings. Not
independently re-verified across the other four fleet repositories for
this release the way `0.4.0`'s record was; `0.4.1` is a targeted
Quest-adapter link fix with no cross-repo qualification-matrix dependency,
and each fleet repository upgrades and syncs on its own schedule
(tracked outside this record).

`0.4.0` is **RELEASED**. Published 2026-09-03 from tag `v0.4.0` at
`b18b7e5c0b42`, by Release run `33712959361` via npm **OIDC trusted
publishing** — no credential was involved at any point. Promoted `dev` to
`main` by PR #531, landed with a local fast-forward push
(`git push origin dev:main`, not the merge button) so `main` picked up no
merge commit; the full `main` CI matrix (including the push-only macOS job)
passed on `b18b7e5` before tagging.

Registry evidence, all seven package names at `0.4.0` with `latest` moved,
verified directly against `registry.npmjs.org` (not the local npm CLI
cache): `@opum-ai/lore`, and
`@opum-ai/lore-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}`.
Clean-install smoke from a fresh temporary directory against the real
registry: `npx --yes @opum-ai/lore@0.4.0 --version` returns `0.4.0`.

**`@opum-ai/lore-linux-arm64` was briefly unreadable after a successful
publish — recorded because it looked like a partial-publish failure and
was not one.** Its `npm publish` step completed and printed npm's own
success confirmation (`+ @opum-ai/lore-linux-arm64@0.4.0`), but also printed
a notice none of the other six packages in the same run received: `Your
package is being processed and may take a few minutes to become available.`
For several minutes afterward, `npm view`/the registry API reported no
`0.4.0` version for that package alone — root `@opum-ai/lore` was already
live at `0.4.0` with `latest` moved, so its `optionalDependencies` pin was
briefly unresolvable for that one platform. Verified via the registry API
directly (bypassing the npm CLI) rather than assumed: the packument
resolved `0.4.0` on a later check, matching a benign npm-side deferred
processing/scan queue for that package specifically (it is the largest of
the six platform tarballs), not a publish failure requiring the resumable
retry the runbook's Rollback section describes.

Why the release exists: `0.3.5`'s `lore check`/`lore validate` never
flagged a concept file whose body opened with a second, parseable `---`
frontmatter fence (LCLI-372) — reachable by hand-editing, copying, or a
future scaffold path, not just `lore new` (already rejected at scaffold
time since `0.3.5`'s own `LCLI-372` AC1). `0.4.0` adds that as a new
error-tier `double-frontmatter` check rule, which is why the bump is minor
rather than patch: a bundle that exited 0 under `0.3.5` can exit non-zero
under `0.4.0` with no change on the consumer's side, and this project
treats a clean `lore check` as the definition of a compliant docs bundle.
`0.4.0` also fixes `lore orphans` misreporting a Done, correctly-linked
Quest task as dangling (LCLI-375), adds a `pendingLinks` bucket to
`lore orphans --json` (LCLI-374), detects a stale `lore:index` managed
block as an always-on error (LCLI-377), and three smaller `lore init`/
`lore agent context` fixes (LCLI-370, LCLI-376, LCLI-371). See
CHANGELOG.md's `[0.4.0]` entry for the full list.

Pre-publish gate: `lore check`, built from the release commit and run from
each of the five fleet repositories' own root (no path argument — see
LCLI-379 below for why an explicit path argument gives a different,
currently-wrong answer), was clean everywhere: opum-agent 12 files,
opum-doc 134, lore-cli 76, quest-cli 63, opum-cli-e2e 7 — 0 errors, 0
warnings, no `double-frontmatter` hits anywhere in the fleet.

**Filed, not fixed, in this release: LCLI-379.** `lore check .` and
`lore check` (no argument) disagree sharply from the same directory —
opum-doc's repo root reports 134 files/0 errors/92 out-of-bundle-links-
skipped with no argument, versus 555 files/14 errors/0 skipped with `.`,
because the explicit-path run walks `.herdr/`, a gitignored 1.2 GB vendored
toolchain the docs bundle does not own. Reproduced identically on installed
`0.3.5` and on the `0.4.0` source, so it predates this release and is not a
regression introduced by it; held out of `0.4.0` per opum-agent's ruling
and tracked as its own task rather than folded into this record's evidence
for what actually shipped.

`0.3.5` was **RELEASED**. Published 2026-08-30 from tag `v0.3.5` at
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
