---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: Resolve the Quest CLI in CI from a pinned source build when its version is not on npm
tags:
  - release
  - ci
  - quest
  - dec-55
summary: "When the Quest version CLAUDE.md declares is not yet on npm, the jobs whose gates drive quest build opum-ai/quest-cli at a pinned commit instead of installing it, so both version locks stay strict."
timestamp: 2026-09-29T18:08:11.699Z
---

# ADR-0023: Resolve the Quest CLI in CI from a pinned source build when its version is not on npm

## Status

Accepted — 2026-09-29, by the operator (DEC-55, answered first-party via
`opum-doc`, relay `ODOC-OP-2026-09-29-21`, 18:00:08Z) and relayed by `opum-agent`.
Scoped to this repository's CI: it changes no product surface and no lock.

## Context

`lore` and `quest` carry one version number (constitution Article 3 clause 1),
and lore refuses at runtime to drive any quest that is not exactly its own
version (LCLI-650). Three of this repository's required contexts drive the
quest binary — `Tracker integrity`, `lore check (docs gate)` and `compile smoke
(ubuntu)` — and each installed it with
`npm install -g "@opum-ai/quest@<the version CLAUDE.md's managed block
declares>"`.

That is unreachable in the window between lore's bump and quest's publish.
Measured on the 0.12.0 bump (LCLI-653, PR #433, head `a2a06ad2`): with lore
0.12.0 and quest 0.11.0 — npm's `latest` for both — the docs gate fails with
exit 6, `the lore 0.12.0 / quest 0.11.0 pair version requirement is not met`,
after printing `82 files, 0 errors, 0 warnings`, so the bundle itself is clean
and the refusal is purely the lock; `compile smoke (ubuntu)` passes its binary
assertion and fails at `scripts/readme-quickstart.sh dist/lore` with the same
error; and `lint · typecheck · test (windows-latest)` fails on the same lock.

Neither ordering could break the deadlock, and both were measured:

- **quest cannot publish first.** quest-cli's publish path runs
  `scripts/qualification/version-parity.mjs` before anything else, and it
  refuses while `opum-ai/lore-cli@main` reads 0.11.0: *"Refusing to publish:
  quest is 0.12.0 … but lore is 0.11.0 …; Article 3.6: lore and quest publish at
  one version, or not at all"*, exit 1, no override.
- **lore cannot land red.** `require-ci-on-dev` (ruleset `22838594`) is
  `enforcement: active` with `bypass: []`, and landing anyway would leave `dev`
  un-landable for every later PR until quest published.

A third arm was considered and is also unreachable: quest's staged
release-candidate launcher pins its platform packages at `X`, and the lock
compares the string the *binary* reports (measured: a launcher at `9.9.9-rc.1`
exec'ing a `0.12.0` platform binary prints `0.12.0`), so an rc would satisfy the
lock — but no rc can be staged, because staging is what the parity gate above
refuses.

What the ruling explicitly does NOT do is relax either side. As the option text
puts it, both version locks stay strict and Article 3 is untouched.

## Decision

**Label, verbatim:** "Build quest from source (Recommended)".

**Option text the operator saw, verbatim:** "When the declared quest version
isn't on npm yet, lore's docs gate and compile smoke build quest from
quest-cli's matching ref. Both version locks stay strict and Article 3 is
untouched."

**Landing order, as relayed with the ruling:** "lore lands and promotes 0.12.0,
then quest stages, then lore stages, e2e qualifies, and both promote."

Implemented as `.github/actions/setup-quest`, called by all three jobs that
drive quest, so their resolution cannot drift apart:

1. **The npm path is unchanged.** `npm install -g "@opum-ai/quest@<declared>"`
   runs exactly as before. Any npm failure — an absent version and an
   unreachable registry are indistinguishable at the exit code — falls through
   to the build.
2. **The fallback builds the peer at a pinned commit.** A blob-filtered,
   no-checkout clone of `https://github.com/opum-ai/quest-cli.git` (a public
   repository: no token, no credentials) brings every commit and tree but no
   file contents — 916 KB in about a second, measured — then a sparse checkout
   of `src`, `package.json`, `bun.lock` and `tsconfig.json` at
   `QUEST_SOURCE_REF` fetches only the blobs a source run needs (2.7 MB,
   measured; the same commit's codeload tarball is 207 MB). Dependencies install
   `--frozen-lockfile` with the Bun pinned by `.bun-version`, which is the
   runtime quest-cli's own lockfile was written by. A shim on `PATH` runs
   `bun run <checkout>/src/cli/main.ts`, forwarding arguments and the working
   directory.
3. **The built CLI is asserted, not assumed.**
   `quest --version` must equal the declared version before any gate runs. A ref
   that has drifted from CLAUDE.md's declaration therefore fails as a ref
   problem, named as one, rather than later as a pair-lock refusal that reads
   like a lore defect.

The fallback is **not available on Windows**, and says so: its shim is an
extensionless bash script, which a Windows bare-name lookup cannot resolve at
all. The step refuses `RUNNER_OS = Windows` explicitly rather than writing a
shim nothing would find — a wider guard would also refuse macOS, where the shim
works. Every caller today is `ubuntu-latest`; ADR-0023 does not cover a Windows
job, and DEC-57 is where that case is being decided.

`QUEST_SOURCE_REF` is a full commit SHA — never a branch, which would let the
peer move under the workflow — and it moves with the declaration in CLAUDE.md,
never independently. For 0.12.0 it is
`ec79b543f4575374e4ece5f73e123fbacdab6f64`, quest-cli's `dev` tip, which carries
`0.12.0` in `package.json`, `src/application/version.ts` and
`src/contract/tracker/index.ts`. A ref offered alongside it as "the bump commit"
(`b6e1da5168a3d9b1d57eb0d3d0e6f7f6c0afebf2`) does not exist on the remote: its
first eight characters were correct and the remaining thirty-two were composed
rather than copied, and a string that denotes no object answers identically from
every query (`gh api` 422, `git fetch` refused, codeload 404). **An earlier
revision of this paragraph explained that as a squash-merge artifact, and that
explanation is false** — measured afterwards: GitHub retains a merged pull
request's head ref, and the deleted head branch's tip (`b2bdfacc…`) still
resolves from both the commits API and codeload. The action checks
`cat-file -e` before checking out and names this failure mode in its own error;
the pin itself must simply be verified against the remote when it is moved.

## Consequences

- The three required contexts can go green while quest X is unpublished, which
  is what lets lore's bump land and promote ahead of quest's staging, the order
  the ruling specifies.
- The cost is paid only in the window: with the declared version on npm, no
  clone, no build, no change in behaviour.
- The pin is a second version-bearing site, and it is guarded **when it is used**
  — while the declared version is on npm the fallback never engages, so nothing
  checks `QUEST_SOURCE_REF` between windows, and a stale ref surfaces at the
  next bump as three red required contexts rather than as a silent wrong peer.
  A reviewer pass measured that and named it: the guard is loud and bounded (a
  one-line fix, and the message names the ref), but it is not a background
  check. Mating the pin to the declaration on every PR would cost a network
  read per job; the ruling did not ask for one, so it is left as a known cost.
- **Not covered by this ADR: `lint · typecheck · test (windows-latest)`.**
  Measured: a fresh `windows-latest` runner has no quest, and yet the job's
  LCLI-614 rows run there and skip on ubuntu — something inside that job
  provisions one. Which mechanism that is was still being measured when this
  ADR was written, and if it needs a different fix it goes back to `opum-agent`
  as an A/B rather than being decided here.
- Nothing about publication changes. This ADR shortens the window in which CI
  cannot run; it does not license publishing anything, and the pair's staging,
  qualification and promotion rules stand.

## See also

Implemented by LCLI-654 (the CI change and its proof); the deadlock this answers
was measured and recorded on LCLI-653 (the 0.12.0 bump), with the runtime lock
itself in [ADR-0020: Tracker version gates are minimum floors](0020-tracker-version-gates-are-minimum-floors.md)
and its superseding exact-pair rule in `opum-doc`'s
`lock-lore-and-quest-to-their-exact-pair-version-at-runtime` (DEC-31).
