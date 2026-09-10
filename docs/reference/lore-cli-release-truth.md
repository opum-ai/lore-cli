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

`0.6.0` is **RELEASED**. Published 2026-09-09 from tag `v0.6.0` at
`59ba30e497f8e98aa6c6be022d9363fd718fb4ee`, by Release run `34393976910` via
npm **OIDC trusted publishing** — no credential was involved at any point,
dispatched directly with `publish: true` (its own job list — `assert release
package versions + metadata are consistent`, every Ladybug qualification, all
six matching-host package qualifications, `package + install-sanity (dry-run,
never publishes)`, and `publish (npm, OIDC trusted publishing)` — ran and
passed in the one dispatch). Promoted `dev` to `main` with a local
fast-forward push (`git push origin dev:main`, not the merge button):
`5734195..59ba30e`. Unlike `0.5.0`'s promotion (which opened a PR into `main`
to collect pre-push CI evidence), this promotion did not open one — `main`
carries zero branch rules (`gh api repos/opum-ai/lore-cli/rules/branches/main`
returns `[]`, confirmed fresh) and the content was already gated at PR time
into `dev` (#646), so the evidence used was the manual ancestor check
(`git merge-base --is-ancestor origin/main origin/dev`, confirmed before
pushing) plus `main...dev` reading ahead 2 / behind 0. `ci.yml`'s `push`
trigger (`branches: [main]`) still fired its own run automatically after the
push (`34393475497`) — 12 real jobs passed including `main is fast-forward of
dev`, `promotion is manual` skipped (only fires on `pull_request`, not
`push`) — but this ran after the promotion, not as its gate. **Report this as
"no checks configured on main," not "checks passed"**: the safety property is
that `main` only ever receives a fast-forward of a `dev` that was itself
gated, not any rule attached to `main` itself.

Tag `v0.6.0` was created directly from a freshly-fetched `origin/main`
(`git tag -a v0.6.0 ... origin/main`, confirmed `59ba30e` immediately before
tagging), not a local `main` ref — the exact category of mistake `0.5.0`'s
entry below records and this repository has not repeated since.

Registry evidence, all seven package names at `0.6.0` with `latest` moved,
verified directly against `registry.npmjs.org` (not the local npm CLI cache):
`@opum-ai/lore` and all six
`@opum-ai/lore-{darwin,linux,win32}-{arm64,x64}` packages, no propagation lag
observed on any package at the time checked (unlike the multi-release
`linux-arm64` pattern `0.4.0`–`0.5.0` recorded — this check happened after
the workflow run had already completed, so an early transient lag before
that point cannot be ruled out from this evidence alone). `@opum-ai/lore@0.6.0`
carries an SLSA provenance attestation
(`npm view @opum-ai/lore@0.6.0 dist.attestations`), confirming OIDC trusted
publishing produced it rather than a fallback token. Clean-install smoke from
a fresh temporary directory against the real registry (`npm install
@opum-ai/lore@0.6.0` followed by `lore --version`) returns `0.6.0`.

**`.claude-plugin/plugin.json`'s `version` matches at the tag: `0.6.0`**,
verified with `git show v0.6.0:.claude-plugin/plugin.json`.

Why the release exists: three shipped changes, no BREAKING changes — a
genuine minor bump. `lore init --migrate-backlog` no longer fails with an
unrecoverable `Alias collision` (exit 5) on a Backlog.md project with a
dotted subtask alongside an unrelated task whose id Quest's positional
renumbering happens to land on; Quest's own escape hatch
(`--preserve-source-ids --source-family <PREFIX>`) is now threaded through
`lore init`'s flag path (LCLI-465, reproduced end-to-end against real
`backlog`/`quest` binaries before fixing, not assumed from quest-cli's
superficially similar but mechanistically different report). The
interactive wizard's sequential yes/no agent-bridge questions are replaced
by one multi-select, nothing pre-checked, coordinated with quest-cli so both
CLIs answer the same UX question the same way; the non-interactive flag path
is unchanged (LCLI-462). A new `--antigravity` bridge writes `GEMINI.md` for
Google Antigravity/Gemini CLI, and the `AGENTS.md` option's label now names
pi and OpenCode as readers of that same file (LCLI-464). See CHANGELOG.md's
`[0.6.0]` entry for the full list. Quest published `0.6.0` independently and
in parallel, continuing the lockstep pairing `0.5.0` started.

**Publish authorization note.** LCLI-278 (no required-reviewer protection on
the `release` GitHub Environment) remains `To Do`, unchanged since `0.5.0`.
This release proceeded on the repository owner's direct, explicit
authorization — asked fresh in this session via `AskUserQuestion` once
`dev`→`main` promotion and tagging were already done and independently
verified, not on any peer's relay of approval: "Authorize dispatching the npm
publish now?" — the owner chose "Yes, dispatch now."

**Qualification evidence went through an honest interim stage before being
bound — recorded precisely rather than glossed, the same
LCLI-333/`baselines/v0.5.0-pair` lesson applied going forward instead of
re-learned.** opum-cli-e2e ran three distinct interim passes before any of
them were promoted to a committed baseline:
1. A 16-suite release-candidate matrix at lore `771edfa` (the
   *0.5.0-labeled* dev tip — `package.json` had not yet bumped there) paired
   with quest `ce551cf`: 426 rows, 414 PASS / 8 FAIL / 4 BLOCKED, the expected
   pre-publish shape.
2. A 2-suite re-check (`00-identity`, `51-lore-packaging`) at lore's actual
   *0.6.0-labeled* tip `59ba30e`, diffed row-by-row against the run above
   rather than compared by summary count: same counts, every difference
   explained by the version string moving or the registry not yet carrying
   `0.6.0` — confirmed from PR #646's own diff that no source file and no
   third-party dependency moved between the two tips, only release metadata.
3. A post-publish smoke pass against the genuinely registry-installed pair:
   `00-identity` now 18/18 PASS, exit 0 — the install-shape and
   launcher-shim-resolution checks pre-publish testing is structurally blind
   to, both clean against the real install.

**Superseded by the bound baseline, cut but not yet merged as of this
writing** (recorded here rather than left implicit, matching how `0.5.0`'s
own entry handles the same shape): opum-cli-e2e's `baselines/v0.6.0-pair`
(TASK-46, opum-cli-e2e PR #75, **OPEN**) binds quest's candidate bundle plus
its native-execution receipt (run `34393839378`, `source.commit ce551cf`)
against lore's six per-platform qualification reports from this release's own
CI run (`34393976910`). Result: **422 rows, 421 PASS / 0 FAIL / 1 BLOCKED**
(the routine out-of-band scale job every non-`v0.2.9`-descended baseline
carries) — confirmed directly against PR #75's own diff
(`baselines/v0.6.0-pair/matrix.md`'s literal `Rows: 422 — PASS 421 / FAIL 0 /
BLOCKED 1` line and its per-row evidence, including real sha256 artifact
digests and invocation receipts), not re-derived from opum-cli-e2e's summary
alone. Once PR #75 merges, this is the citation `LCLI-333`'s AC#2 requires for
`0.6.0` — the three interim passes above are process history, not
qualification evidence in their own right, whether or not the PR has landed
yet.

Pre-publish gate: `lore check` on this repository's own bundle, built from
the release commit, was clean — 77 files, 0 errors, 0 warnings. Full test
suite 2901 pass, 1 skip (pre-existing), 0 fail; typecheck exit 0; lint exit 0
(one pre-existing warning in `src/commands/agents.ts`, unrelated to this
release and present before it). Verified against `59ba30e` itself, not
inferred from the pre-squash branch commit: `git diff 9154002 59ba30e --stat`
is empty, and `9154002` was the sole commit squashed into `59ba30e`, so the
tree the tests ran against is byte-identical to what shipped.

`0.5.0` is **RELEASED**. Published 2026-09-08 from tag `v0.5.0` at
`66aef640089cee2b45f4624536194723c7396487`, by Release run `34238810885` via
npm **OIDC trusted publishing** — no credential was involved at any point,
dispatched directly with `publish: true` (no separate `publish: false`
dry-run; its own job list — `assert release package versions + metadata are
consistent`, every Ladybug qualification, all six matching-host package
qualifications, and `publish (npm, OIDC trusted publishing)` — ran and passed
in the one dispatch). Promoted `dev` to `main` with a local fast-forward push
(`git push origin dev:main`, not the merge button), confirmed by
`git merge-base --is-ancestor origin/main origin/dev` before tagging; a
promotion PR (#622, `dev` into `main`) ran the full `main`-triggered CI matrix
against `66aef64` — 10 real checks passed, `promotion is manual` failed on
purpose (by design, per its own job name), `main is fast-forward of dev`
skipped on the PR (push-only trigger) and separately passed on the actual push
to `main` (run `34237375574`, 11 jobs succeeded including the macOS leg).

**Tag mistake, caught before any real publish happened.** The first tagging
attempt ran `git tag -a v0.5.0 ... main` against a **stale local `main` branch
ref** — this repository had never checked out `main` locally before this
release, so the local ref still pointed at the `0.4.3` commit, 35 commits
behind `origin/main`, rather than the `origin/main` this session had just
fast-forwarded to `66aef64`. The tag was pushed in that state and dispatched
(Release run `34237851380`): its job log shows `publishing version 0.4.3`, and
every one of the seven packages logged `already published — skipping
(resuming a partially-failed publish)` — the workflow's own resumable-publish
guard, designed to make a re-dispatch after a partial failure safe, correctly
recognized `0.4.3` as already live and skipped every package rather than
publishing anything. **The registry was never touched by this**, confirmed
directly: `registry.npmjs.org` still reported `0.4.6` on every package
immediately after that run reported "success," and `git show
v0.5.0:package.json` showed `"version": "0.4.3"` at the tag — the smoking
gun. Fixed by deleting the tag locally and on `origin`, resetting the local
`main` ref to `origin/main` (`git branch -f main origin/main`), retagging at
the correct commit, re-pushing, and re-dispatching (`34238810885`, the run
this entry's release facts describe) — its log shows `publishing version
0.5.0` and a genuine `npm notice Publishing...`/`+ @opum-ai/<pkg>@0.5.0` line
for all seven packages. Recorded here rather than smoothed over: the mechanism
that made this catchable is the same resumable-publish design LORE-278's own
history already relies on, and the moment of doubt was verifying the tag's
own tree content directly rather than trusting the workflow's "success."

Registry evidence, all seven package names at `0.5.0` with `latest` moved,
verified directly against `registry.npmjs.org` (not the local npm CLI cache):
`@opum-ai/lore`, and
`@opum-ai/lore-{darwin-arm64,darwin-x64,linux-x64,win32-arm64,win32-x64}`
resolved within seconds of publish; `@opum-ai/lore-linux-arm64` again ran the
familiar benign propagation lag recorded for every release `0.4.0` through
`0.4.6` — this time markedly longer than any prior instance (~25 minutes,
resolved 2026-09-08T14:49:18Z, versus a previous worst case of ~35 seconds),
long enough that opum-cli-e2e independently flagged it as a possible install-
breaking defect before it resolved. It was not: the registry API's `versions`
map genuinely lacked the `0.5.0` key on every poll (not a stale CDN cache —
checked via response headers directly, `cf-cache-status`/`age` showed a fresh
origin fetch that still lacked the version), then it appeared, matching every
prior instance's shape exactly. Clean-install smoke from a fresh temporary
directory against the real registry (`npm install @opum-ai/lore@0.5.0`
followed by `lore --version`) returns `0.5.0`.

The pattern is now three-releases-long and strictly worsening (0.4.5's
~15s, 0.4.6's ~35s, 0.5.0's ~25min) rather than random jitter — LCLI-457's
closing note files a deferred chore to give the release workflow's own
registry-verification step a longer window with backoff, distinguishing
"not yet visible" from "wrong content," rather than continuing to treat each
instance as a one-off worth re-diagnosing from scratch.

**`.claude-plugin/plugin.json`'s `version` matches at the tag: `0.5.0`**,
verified with `git show v0.5.0:.claude-plugin/plugin.json`.

Why the release exists: wave 3 of the OPAG-64/OPAG-65 fleet backlog campaign's
stacked release. Two BREAKING changes ship: `InitResult.backlog` and the
internal `legacyBacklogCheck` helper are removed, leaving `trackerCheck` as
the only tracker-capability field `lore init --json` emits (LCLI-359); and
Quest writes now require an explicit actor declaration, failing closed
(`error_type: validation`) instead of silently defaulting to a fabricated
human identity, unified across `lore link`/`lore unlink`/`lore init
--migrate-backlog` (LCLI-434, unified in LCLI-459). From this release on, Lore
and Quest move in lockstep, sharing one version number at every stacked
release — quest-cli published 0.5.0 independently and in parallel, neither
release waiting on the other. opum-cli-e2e qualified this release candidate
(lore-cli dev `66aef64` paired with quest-cli dev `45cc742`) before either
side tagged: the full cross-product suite came back green (415/426 pass; the
remaining 8 fails and 4 blocked rows are expected pre-publish measurement
artifacts — receipt and registry not yet bound — the same shape wave 0 showed
before binding). See CHANGELOG.md's `[0.5.0]` entry for the full list.

**Superseded by the bound, post-publish run**, recorded here rather than
left implicit (LCLI-333, 2026-09-09): the 415/426 figure above is the
pre-publish, pre-tag interim measurement, not the final evidence — its own
sentence says so ("receipt and registry not yet bound"). opum-cli-e2e's
`baselines/v0.5.0-pair` (TASK-37, promoted 2026-09-08) is the bound run: both
CLIs genuinely installed from npm rather than a dev checkout, quest's
candidate bound from its own prepublication-qualification CI run
(`34236631001`, tag `v0.5.0`, 10/10 green) and lore's six per-platform
reports bound from this repository's release run (`34238810885`, tag
`v0.5.0`). Result: 422 rows, 421 PASS / 0 FAIL / 1 BLOCKED (the routine
out-of-band 10k-task scale job every non-`v0.2.9`-descended baseline
carries) — confirmed directly against opum-cli-e2e's own record, not
re-derived. This is the same interim-then-bound shape `v0.4.0-pair` went
through (a same-day partial cut before evidence was bound, superseded by its
final run) and is the citation LCLI-333 should read for this release's
qualification evidence, not the paragraph above.

That said, `baselines/v0.5.0-pair`'s 422 rows do not map cleanly onto the
eight scenarios LCLI-333's own AC#2 names (new-bundle, legacy Backlog,
explicit Backlog, explicit Jira, missing Quest, incompatible Quest,
migration, pinning) — checked directly with opum-cli-e2e rather than assumed
from the aggregate pass count. Two are confirmed gaps: `--migrate-backlog`'s
Quest adapter path has no suite coverage at all (opum-cli-e2e's own TASK-36,
filed 2026-09-08, To Do), and no suite ever invokes `--tracker jira` despite
it being a real, documented flag (not yet tracked anywhere as of this
writing). Coverage for `--tracker quest` against an absent or
version-incompatible Quest binary specifically at `lore init` time is
unconfirmed either way. The remaining four are "plausibly covered under
different names" per opum-cli-e2e's own suite grep, pending a read of each
row's actual assertions. LCLI-333 carries the live status of closing these.

Pre-publish gate: `lore check` on this repository's own bundle, built from the
release commit, was clean — 77 files, 0 errors, 0 warnings. Full test suite
2889 pass, 1 skip (pre-existing), 0 fail; typecheck and lint both clean (lint's
one warning, in `src/commands/agents.ts`, pre-existed the release commit and
is unrelated to it).

**Publish authorization note.** LCLI-278 (no required-reviewer protection on
the `release` GitHub Environment) remains `To Do`. This release proceeded on
the repository owner's direct, explicit authorization — asked fresh in this
session via `AskUserQuestion` (opum-agent, the fleet orchestrator, had relayed
that opum-cli-e2e's qualification was green and that lore-cli should proceed;
per this repo's fleet-ops rules a peer's relay does not substitute for the
user's own session saying so, so the question was asked in this session
directly: promote `dev` to `main`, tag `v0.5.0`, and dispatch the npm publish
for all seven packages — the owner chose "Yes, proceed with full release") —
consistent with the standing practice recorded in README.md and with how
`0.3.5` through `0.4.6` actually shipped. LCLI-278 itself has not been
resolved or closed.

`0.4.6` is **RELEASED**. Published 2026-09-07 from tag `v0.4.6` at
`e98e2171e3014b01e5689f1739d9822378e7aa6c`, by Release run `34131804527` via npm
**OIDC trusted publishing** — no credential was involved at any point, dispatched
directly with `publish: true` (no separate `publish: false` dry-run; its own job
list — `assert release package versions + metadata are consistent`, every
Ladybug qualification, all six matching-host package qualifications, and
`publish (npm, OIDC trusted publishing)` — ran and passed in the one dispatch).
Promoted `dev` to `main` with a local fast-forward push (`git push origin
dev:main`, not the merge button), confirmed by `git rev-parse` equality on both
refs before tagging; a promotion PR (#605, `dev` into `main`) ran the full
`main`-triggered CI matrix against `e98e217` and all 9 checks passed before the
fast-forward and tag.

Registry evidence, all seven package names at `0.4.6` with `latest` moved,
verified directly against `registry.npmjs.org` (not the local npm CLI cache):
`@opum-ai/lore`, and
`@opum-ai/lore-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}`.
Clean-install smoke from a fresh temporary directory against the real registry:
`npm install @opum-ai/lore@0.4.6` followed by `lore --version` returns `0.4.6`.

**`@opum-ai/lore-linux-arm64` was again briefly unreadable after a successful
publish — the identical benign pattern `0.4.0` through `0.4.5` all recorded,
not a recurrence worth escalating a seventh time — though this time the lag ran
longer (~35+ seconds rather than ~15) before the registry API caught up.** The
job log's own `npm publish` step printed npm's success confirmation
(`+ @opum-ai/lore-linux-arm64@0.4.6`, verified directly) at the time of
publish; the registry API's `versions` map genuinely lacked the `0.4.6` key
(not just a stale `latest` tag) on the first several polls, then resolved.
Verified via the registry API directly rather than assumed, polled in a loop
rather than a fixed guess at how long to wait.

**`.claude-plugin/plugin.json`'s `version` matches at the tag: `0.4.6`**,
verified with `git show v0.4.6:.claude-plugin/plugin.json`.

Why the release exists: LCLI-455 is an urgent fix, not a routine one. Quest
0.4.0 (QCLI-229) adds a non-terminal `Blocked` status excluded from
`task status-flow`'s ladder by design; without this fix, `lore sync`/`lore
check` would hard-fail the moment any fleet repository used `quest task pause`
on a Story-linked task. quest-cli held their own quest 0.4.0 npm publish until
this release was live. See CHANGELOG.md's `[0.4.6]` entry for the full list.

Pre-publish gate: `lore check` on this repository's own bundle, built from the
release commit, was clean — 77 files, 0 errors, 0 warnings. Full test suite
2868 pass, 1 skip (pre-existing), 0 fail; typecheck and lint both clean (lint's
one warning, in `src/commands/agents.ts`, pre-existed the release commit and is
unrelated to it).

**Publish authorization note.** LCLI-278 (no required-reviewer protection on
the `release` GitHub Environment) remains `To Do`. This release proceeded on
the repository owner's direct, explicit authorization — asked fresh in this
session via `AskUserQuestion` (opum-agent, the fleet orchestrator, had relayed
that the owner approved cutting 0.4.6 in its own session; per this repo's
fleet-ops rules a peer's relay of "the user approved this" does not substitute
for the user's own session saying so, so the question was asked again here:
"cut 0.4.6 now" vs. "promote/tag only, hold the publish" vs. "wait"; the owner
chose "Yes, proceed with full release") — consistent with the standing
practice recorded in README.md and with how `0.3.5` through `0.4.5` actually
shipped. LCLI-278 itself has not been resolved or closed.

`0.4.5` is **RELEASED**. Published 2026-09-07 from tag `v0.4.5` at
`70d61df31270d2ba3ab59864504fb1fa0ee5e9b2`, by Release run `34126369315` via npm
**OIDC trusted publishing** — no credential was involved at any point, dispatched
directly with `publish: true` (no separate `publish: false` dry-run; its own job
list — `assert release package versions + metadata are consistent`, every
Ladybug qualification, all six matching-host package qualifications, and
`publish (npm, OIDC trusted publishing)` — ran and passed in the one dispatch).
Promoted `dev` to `main` with a local fast-forward push (`git push origin
dev:main`, not the merge button), confirmed by `git rev-parse` equality on both
refs before tagging; a promotion PR (#600, `dev` into `main`) ran the full
`main`-triggered CI matrix against `70d61df` and all 9 checks passed before the
fast-forward and tag.

Registry evidence, all seven package names at `0.4.5` with `latest` moved,
verified directly against `registry.npmjs.org` (not the local npm CLI cache):
`@opum-ai/lore`, and
`@opum-ai/lore-{darwin-arm64,darwin-x64,linux-arm64,linux-x64,win32-arm64,win32-x64}`.
Clean-install smoke from a fresh temporary directory against the real registry:
`npm install @opum-ai/lore@0.4.5` followed by `lore --version` returns `0.4.5`.

**`@opum-ai/lore-linux-arm64` was again briefly unreadable after a successful
publish — the identical benign pattern `0.4.0` through `0.4.4` all recorded,
not a recurrence worth escalating a sixth time.** The registry API reported
`0.4.4` as `latest` for that package alone on the first poll, then resolved to
`0.4.5` on the second (~15 seconds later). Verified via the registry API
directly rather than assumed.

**`.claude-plugin/plugin.json`'s `version` matches at the tag: `0.4.5`**,
verified with `git show v0.4.5:.claude-plugin/plugin.json`.

Why the release exists: to end the hold on LCLI-446 (`lore agents --check` no
longer labels an absent, plugin-sourced SKILL.md as "up to date") and to carry
LCLI-453 — the OPAG-61 fleet-operating block sync adding the `opum-marketplace`
row — to `main` without waiting for a larger release. See CHANGELOG.md's
`[0.4.5]` entry for the full list.

Pre-publish gate: `lore check` on this repository's own bundle, built from the
release commit, was clean — 77 files, 0 errors, 0 warnings. Full test suite
2857 pass, 1 skip (pre-existing), 0 fail; typecheck and lint both clean (lint's
one warning, in `src/commands/agents.ts`, pre-existed the release commit and is
unrelated to it).

**Publish authorization note.** LCLI-278 (no required-reviewer protection on
the `release` GitHub Environment) remains `To Do`. This release proceeded on
the repository owner's direct, explicit authorization — asked fresh in this
session via `AskUserQuestion` (opum-agent, the fleet orchestrator, had relayed
that the owner approved cutting 0.4.5 in its own session; per this repo's
fleet-ops rules a peer's relay of "the user approved this" does not substitute
for the user's own session saying so, so the question was asked again here
before any promotion or publish action: "cut 0.4.5 now" vs. "promote/tag only,
hold the publish" vs. "wait"; the owner chose "Yes, proceed with full
release") — consistent with the standing practice recorded in README.md ("the
owner lifted the `publish: true` prohibition on 2026-08-29") and with how
`0.3.5` through `0.4.4` actually shipped. LCLI-278 itself has not been resolved
or closed; the note there flags that the task record and the actual practice
have diverged.

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

**Corrected citation (LCLI-461, 2026-09-09).** This originally cited "opum-cli-e2e's
407-row matrix, `402 PASS / 0 FAIL / 0 BLOCKED` against the quest 0.3.0 candidate
bundle" — wrong on two counts, confirmed directly against opum-cli-e2e's own
committed evidence rather than assumed. 407 was never a real run total for this
pair; it's `baselines/v0.2.9`'s pre-candidate-binding row count, and their own
README documents the 407→402 transition as candidate-binding's expected net
effect. The 402/402 figure was a real run (`evidence/pair-quest030-lore035/`,
commit `c69b58a`, 2026-08-29) — not the misattributed one this doc's own
lessons-learned notes warn about, that bundle was discarded before ever being
committed — but it measured a **locally packed** lore 0.3.5 candidate, and
opum-cli-e2e's later `evidence/rank1-pair-published/README.md` found that
premise false: Bun's `--compile` is not byte-reproducible across machines, so
the candidate's native binary digest (`46818b7b6552…`) does not match what
`0.3.5` actually published (`e40154bd757d…`). The candidate run measured a real
lore 0.3.5 build, but not the one that shipped.

**Terminal qualification: `evidence/rank1-pair-published/`, commit `3c0a550`,
2026-08-30 — 403 rows, 403 PASS / 0 FAIL / 0 BLOCKED, quest `0.3.0` and lore
`0.3.5` both installed from the published npm registry**, plus the workflow's
own six matching-host platform qualifications carried forward by artifact and
re-verified by digest at assembly. This is the run opum-cli-e2e's own TASK-22
summary names as terminal, and the only one of the three pair-level results in
their history that installs the artifact that actually shipped rather than a
pre-publish stand-in for it.

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
