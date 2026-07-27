---
type: Runbook
title: Release publishing
tags:
  - release
  - npm
  - ci
summary: How to configure npm trusted publishing and cut a release once the dry-run pipeline is verified.
timestamp: 2026-07-11T17:15:34.083Z
---

# Release publishing

## Purpose

lore ships as **six** npm packages (ADR-0001 §"Distribution"): the root
`@salient-data/lore` (the thin Node `.cjs` launcher, `bin/lore.cjs`) plus five
per-platform binary packages published as its `optionalDependencies` —
`@salient-data/lore-darwin-arm64`, `-darwin-x64`, `-linux-arm64`, `-linux-x64`,
and `-win32-x64`.

The `.github/workflows/release.yml` workflow (`workflow_dispatch`-only — it never
fires on a push or tag) **compiles all five platform binaries, assembles all
six packages, and proves the `npx`/launcher resolution mechanism end-to-end**
via `npm pack` + a scratch install + running the launcher (LORE-9), then, only
when a maintainer manually dispatches it with `publish: true`, **publishes all
six existing packages via npm OIDC Trusted Publishing** (LORE-255).

The initial `0.1.0` release is a one-time bootstrap exception: npm requires a
package to exist before a Trusted Publisher can be configured, and none of the
six names exists yet. The exact CI-built tarballs are therefore published
interactively with 2FA, platform packages first and root last; Trusted
Publishing is configured immediately afterward for every later release. The
OIDC publish job is **unprotected** until the repo-admin [`release` GitHub Environment setup
(LORE-268)](#repo-admin-setup-for-the-release-environment-lore-268) is done —
without it, a future OIDC dispatch can publish without an independent
workflow-file-external approval. See the [First-release
checklist](#first-release-checklist) below for the exact mechanical sequence
to cut the actual first release; the rest of this runbook is the supporting
detail behind each checklist item.

## First-release checklist

Walk this in order for the actual first release. Every item elaborates on a
section below it — follow the link for the exact commands/fields;
none of the automated checks substitute for the external registry and
repository settings. The `publish` job independently rejects `0.0.0`, but the
first release deliberately does not use that job because OIDC trust cannot yet
be configured.

- [ ] **Coordinated version bump: all six manifests + the 5
  `optionalDependencies` pins**, root `0.0.0` → `0.1.0` —
  [Step 3, item 2](#3-cut-a-release). This is exactly the 12 values
  `verify-versions` cross-checks (6 `version` fields + the 5 pins + the
  platform-set itself); a missed file fails loud there before any compile
  work runs, rather than silently skip-installing a platform package later.
- [ ] **Flip `package.json`'s `bin.lore` from `src/cli.ts` to
  `bin/lore.cjs`**, for real, in the same commit as the version bump —
  [Step 3, item 1](#3-cut-a-release). `release.yml`'s `package` job only ever
  patches a *scratch* copy to dry-run-prove the launcher and reverts it — this
  file is deliberately left to a maintainer, not automated.
- [ ] **CHANGELOG.md**: move the `[Unreleased]` section's entries under
  `## [0.1.0] - YYYY-MM-DD`, in the same commit as the version bump,
  so the tag below points at a commit whose CHANGELOG already reflects it.
- [ ] **Merge to `dev`, fast-forward `main`, and wait for the full `main` CI
  matrix**, then tag the verified commit: `git tag v0.1.0 && git push --tags`.
- [ ] **Dispatch `Release` with `publish: false`** on the tag/commit. Download
  the resulting `npm-packages` artifact; do not rebuild or repack locally.
- [ ] **Bootstrap-publish the downloaded tarballs interactively with 2FA**:
  publish the five platform packages first, then `@salient-data/lore` last.
  Use `npm publish <tarball>` and stop immediately on any failure.
- [ ] **Create the `release` GitHub Environment** with the repository owner as
  required reviewer. This repository has only one collaborator, so
  prevent-self-review must remain disabled to avoid deadlocking release
  dispatches; record that accepted weaker control.
- [ ] **Configure npm Trusted Publishing for all six now-existing packages**,
  using repository `jeremy-newhouse/lore`, workflow `release.yml`, Environment
  `release`, and allowed action `npm publish`. Future releases use
  `publish: true`; `0.1.0` does not.
- [ ] **Post-publish smoke install**: from a machine that has never installed
  lore before, `npx @salient-data/lore@0.1.0 --version`, on at least one
  platform other than the one used for local development.

## Prerequisites

- **A tagged MrLesk/Backlog.md release containing PR #790 (BACK-545, the
  --json support lore depends on)** — see [ADR-0002's amendment](../adr/0002-backlog-integration-json-only.md).
  lore does not cut its first release until this exists: today's adapter
  (LORE-53/LORE-54) targets upstream's real --json contract, but only via an
  interim pinned-commit build developers must compile themselves (RUNBOOK_HINT
  in `src/adapters/backlog.ts`) — no package.json dependency, no tagged
  release to point end users at. Check `gh release list --repo MrLesk/Backlog.md`
  before starting this runbook; if the latest tag predates that PR's merge
  commit, stop here.
- Maintainer access to the `@salient-data` npm org (or user account, if the
  scope is personal), with account-level 2FA — required for the interactive
  bootstrap publish and subsequent Trusted Publisher configuration; this is
  not something CI or an agent can do.
- npm CLI **>= 11.5.1** on any machine used for a manual/bootstrap publish
  (trusted publishing itself only requires this on the *publishing* side).
  In CI, `release.yml`'s `publish` job does not rely on whatever npm version
  the runner's Node happens to bundle: it explicitly runs `npm install -g
  npm@^11` and then asserts the `>= 11.5.1` floor before publishing
  anything.
- GitHub-hosted runners only — npm trusted publishing does not support
  self-hosted runners (`release.yml` already uses `ubuntu-latest`).

### Repo-admin setup for the release Environment (LORE-268)

> **Current blocker (2026-07-27, LORE-278):** GitHub rejected creation of\n> the required-reviewer rule with HTTP 422 because the repository’s current\n> billing plan does not support Environment required reviewers. A `release`\n> Environment now exists, but it has zero protection rules, no deployment branch\n> policy, and administrator bypass enabled. Upgrade/change the plan or
> visibility, or approve an equivalent out-of-file control, before any
> `publish: true` dispatch.

**Why this exists:** npm Trusted Publishing (Step 1, below) matches an OIDC
token on **repository + workflow FILENAME — not a ref.** `release.yml` is
`workflow_dispatch`-reachable on *any* branch, so an actor with write access
to this repo could push a branch carrying a `release.yml` with every in-file
guard stripped (the `if: inputs.publish == true` gate, the `0.0.0` refusal,
the npm-version floor) and dispatch it there; the resulting OIDC token would
still authenticate, because npm never looks at which ref the run came from.
Every guard *inside* `release.yml` — including a hypothetical
`if: github.ref == 'refs/heads/main'` check — is defeated by this, because
the attacker supplies the workflow file itself. Only a control configured
**outside** the file can survive the file being replaced.

`release.yml`'s `publish` job now declares `environment: release`
(LORE-268), which is the hook for that out-of-file control — but the
declaration by itself does **not** provide any protection yet. Two separate
pieces of repo-admin configuration have to exist before it does, and this
task (LORE-268) deliberately does not perform either of them — creating a
GitHub Environment and its protection rules, and registering it with npm,
are both actions an agent must not self-authorize (the same boundary as
LORE-196 and LORE-257):

- [ ] **Create the `release` GitHub Environment** (repo Settings →
  Environments → New environment, name it exactly `release`) and configure
  its protection rules. **Required reviewers** is the option that holds
  regardless of branch protection: any run — including one from a forged
  workflow file dispatched on an arbitrary attacker branch — pauses for
  manual approval before the `publish` job executes, no matter which branch
  it came from. This repository currently has only one collaborator, its
  owner. For the `0.1.0` setup, list that owner as the required reviewer and
  leave **Prevent self-review disabled** so releases are operable. This is an
  accepted weaker control: it adds a deliberate approval pause but does not
  protect against compromise or malicious action by the sole owner. If a
  second trusted maintainer is added later, make that person the reviewer and
  enable Prevent self-review. A
  **deployment branch policy** (e.g. restricting deploys to `main` or a
  `release/*` pattern) is *not* a substitute for required reviewers unless
  the allowed branch(es) are themselves protected against direct pushes
  (branch protection or a ruleset that requires a PR and bars pushing
  straight to the branch) — otherwise an actor with write access just pushes
  their forged `release.yml` directly to an allowed branch and dispatches it
  from there, satisfying the policy without ever opening a PR. Even a
  ruleset that requires a PR can be defeated by its own **bypass list**: a
  ruleset's `bypass_actors` entries let the roles named there push straight
  past its rules, PR requirement included. This repo's own
  `require-docker-e2e-on-dev` ruleset, for example, carries a
  `RepositoryRole` id `5` (admin) bypass actor with `bypass_mode: "always"`
  (`gh api repos/jeremy-newhouse/lore/rulesets/19698059`) — so any
  admin-level actor bypasses it outright regardless of what its rules say;
  check a ruleset's bypass list, not just its rules, before treating it as a
  substitute for required reviewers. **In this repo, today, that
  precondition does not hold**: `main` has no branch protection (`gh api
  repos/jeremy-newhouse/lore/branches/main/protection` returns 404 "Branch
  not protected") and the repo's only ruleset (`require-docker-e2e-on-dev`)
  targets `refs/heads/dev` only and enforces a required status check, not
  PR-only pushes — so a deployment-branch policy restricting to `main` would
  **not** currently stop the attack this section exists to prevent. Either
  use required reviewers, or first lock down direct pushes to whichever
  branch(es) the policy would allow, before relying on a branch policy
  alone. GitHub auto-creates an environment the first time a workflow
  references it if it doesn't already exist — but an auto-created
  environment has **no** protection rules by default, so skipping this step
  leaves the `environment: release` line in `release.yml` purely cosmetic.
- [ ] **Set each of the six packages' npm Trusted Publisher "Environment
  name" field to `release`** (Step 1, below). This is what stops an attacker
  from defeating the environment gate the same way they'd defeat any
  in-file guard — by simply deleting the `environment: release` line from
  their branch's copy of the workflow. Without this field set on npm's side,
  omitting the line entirely skips the GitHub Environment check with no
  consequence, because nothing downstream required that OIDC claim in the
  first place. With it set, npm's verification independently rejects any
  token that doesn't carry the `environment: release` claim — a check
  npm performs on its own servers, which no edit to this repo's workflow
  file can influence.

**Residual risk:** the `environment: release` declaration shipped by
LORE-268 is a necessary hook, not a complete mitigation on its own. Until
**both** checklist items above are done, the exact attack this section
opens with — a forged `release.yml` dispatched on an attacker-controlled
branch — remains fully possible: an auto-created, rule-less environment
blocks nothing, and an unconfigured npm Trusted Publisher doesn't require
the environment claim at all. Neither this workflow change nor
`test/release-workflow.test.ts` can verify that the two checklist items
have actually been completed on npmjs.com/GitHub Settings — that
verification has to happen out of band, by the repo admin who performs
them.

## Steps

### 1. Bootstrap `0.1.0`, then configure npm Trusted Publishing

npm's OIDC-based Trusted Publishing (GA since 2025-07) lets `release.yml`
publish **without a long-lived `NPM_TOKEN` secret** — GitHub's OIDC token
authenticates the publish directly. npm requires a package to exist before its
trust relationship can be created, so OIDC cannot authenticate lore's first
publication. See <https://docs.npmjs.com/cli/v11/commands/npm-trust/>.

For `0.1.0`, dispatch `Release` with `publish: false`, download its exact
`npm-packages` artifact, and publish those tarballs interactively with 2FA.
Publish all five `@salient-data/lore-<platform>-<arch>` packages first and
`@salient-data/lore` last. Do not rebuild locally: the downloaded tarballs are
the bytes the workflow compiled, packed, and install-smoke-tested.

After all six packages exist, for **each package** (`@salient-data/lore` and the five
`@salient-data/lore-<platform>-<arch>` packages), on npmjs.com:

1. Open the package's Settings page → **Trusted Publisher** section.
2. **Select your publisher** → **GitHub Actions**.
3. Fill in (all fields are case-sensitive, exact-match):
   - **Organization or user**: `jeremy-newhouse`
   - **Repository**: `lore`
   - **Workflow filename**: `release.yml` (exactly — the filename this repo's
     workflow already uses, so no rename is needed later)
   - **Allowed actions**: `npm publish`
   - **Environment name**: `release` — `release.yml`'s `publish` job now
     declares `environment: release` (LORE-268). Setting this field makes
     npm's own OIDC verification require the resulting token to carry a
     matching `environment: release` claim, which only happens when the run
     actually deployed to a GitHub Environment named `release`. This is what
     closes the last loophole in the out-of-file gate described in
     [Repo-admin setup for the release Environment](#repo-admin-setup-for-the-release-environment-lore-268)
     above: without this field set, an attacker who deletes the
     `environment:` line from a forged copy of `release.yml` mints an OIDC
     token npm would still accept, because nothing on npm's side required
     the claim in the first place.
4. Save.

Repeat for all six package names. Validation happens on the next OIDC publish,
not at save time — a typo here fails silently until the workflow tries to
publish a later version.

### 2. The `publish` job (already in `release.yml`)

After the interactive `0.1.0` bootstrap and trust configuration,
`release.yml`'s `publish` job publishes all six packages via npm's OIDC-based
Trusted Publishing — `permissions: { id-token: write }` set at the **job**
level (not the workflow level, which stays `contents: read`-only), so only
this one job ever gets the token. It:

- Only runs when a maintainer manually dispatches the workflow with
  `publish: true` (`if: ${{ inputs.publish == true }}`) — the workflow itself
  stays `workflow_dispatch`-only (never fires on push/tag), so this cannot
  fire accidentally. **This `if:` guard, like every other guard inside
  `release.yml`, only constrains a run of the *committed* workflow — it does
  nothing against a run of a modified copy dispatched from an
  attacker-controlled branch**, since npm Trusted Publishing matches on
  repository + workflow filename, not a ref (see [Repo-admin setup for the
  release Environment (LORE-268)](#repo-admin-setup-for-the-release-environment-lore-268)).
- Declares `environment: release` (LORE-268) — the out-of-file gate that
  *does* survive a modified copy of this file, but only once a repo admin
  has completed the two setup steps in that same section; the declaration
  alone is inert.
- `needs: [setup, package]` — `package` already needs `build`, which needs
  `verify-versions`, so every existing consistency/artifact check transitively
  gates it; it never runs against unverified artifacts.
- Downloads the exact `npm-packages` artifact tarballs the `package` job
  already assembled and dry-run-verified (no re-packing, so what gets
  published is byte-identical to what was just proven).
- Uses `actions/setup-node` with `registry-url: https://registry.npmjs.org`,
  upgrades npm (`npm install -g npm@^11` — floor-plus-major pinned, not
  `@latest`, since this is the only job with `id-token: write`) and then
  asserts the resolved npm CLI meets the `>= 11.5.1` floor (Prerequisites,
  above) before publishing anything — fails loud rather than hitting a
  confusing OIDC error mid-publish.
- Refuses to publish if the release version is still the pre-release
  placeholder `0.0.0` — checked once, against the root tarball, before any
  package is published. This is the one precondition every other
  `release.yml` check leaves open (see the [First-release
  checklist](#first-release-checklist) note above): a `publish: true`
  dispatch made after Trusted Publisher setup but before the version-bump
  checklist item would otherwise pass every other gate.
- Publishes the **five platform binary packages first, the root launcher
  last**. Root's `optionalDependencies` pin the five platform packages at an
  exact version, and `bin/lore.cjs` `require.resolve()`s them at runtime — if
  root published first, `npx @salient-data/lore` could resolve a launcher
  whose platform deps still 404 (npm silently skips an unresolvable optional
  dependency rather than failing the install, so the failure only surfaces at
  run time as "no compiled binary found"). Publishing root last also means a
  mid-loop failure leaves nothing installable yet, rather than a launcher
  live at a version whose binaries never arrived.
- The publish loop is **resumable**: before each package, it checks whether
  `name@version` is already on the registry (`npm view`) and skips it if so.
  Re-dispatching `Release` with `publish: true` on the same commit after a
  partial failure therefore finishes the remaining packages instead of
  403ing (`EPUBLISHCONFLICT`) on the ones already published — see
  [Rollback](#rollback)'s "Publish job failed partway" entry.
- Runs `npm publish` against each of the six tarballs — no `NPM_TOKEN`/secret
  needed once Step 1's Trusted Publisher setup exists for that package; until
  then, that package's `npm publish` call fails with an auth/403 error, which
  is the correct "not ready yet" outcome, not a hazard.

Further wiring **is** needed before the first OIDC release: see [Repo-admin setup for
the release Environment
(LORE-268)](#repo-admin-setup-for-the-release-environment-lore-268) for the
two one-time, out-of-file steps (creating the `release` GitHub Environment
with required reviewers, and setting each package's npm Trusted Publisher
Environment name to `release`) that make the `environment: release`
declaration above actually protective rather than cosmetic. See the
[First-release checklist](#first-release-checklist) for the bootstrap sequence
and the handoff to OIDC.

**Scoped-package public access:** all six `@salient-data/lore*` packages are
scoped, and npm defaults a scoped package's first publish to
restricted/private access — it fails with an access-denied error unless the
publish is explicitly marked public. Root `package.json` and all five
`npm/<platform>/package.json` manifests already carry `"publishConfig": {
"access": "public" }` for this reason, so a plain `npm publish` (no
`--access` flag needed) succeeds; if that key is ever removed, pass
`--access public` explicitly to `npm publish` for all six packages instead.

### 3. Cut a release

1. **Flip `package.json`'s `bin.lore` from `src/cli.ts` to `bin/lore.cjs`.**
   It is deliberately **not** flipped yet (LORE-9): `bin/lore.cjs` only works
   once the five platform packages it `require.resolve`s are actually
   published, and flipping it any earlier would break every pre-publish
   install path (git dependency, `npm`/`bun link`) with no fallback to run
   from source. This flip is the first-release trigger, not a standing state.
2. Bump `version` in `package.json` and all five `npm/<platform>/package.json`
   files to the same new value, **and update root `package.json`'s five
   `optionalDependencies` pins to that same exact version**, in one commit —
   `release.yml`'s `verify-versions` job (which `build` depends on and
   therefore gates) asserts all six versions, plus the `optionalDependencies`
   pin and `license`/`author`/`repository` metadata, are consistent before
   compiling anything, so a missed file fails loud here rather than silently
   skipping an optional dependency later.
3. Merge to `dev`, fast-forward `main`, and wait for the full `main` CI matrix.
   Tag that verified commit (`git tag v0.1.0 && git push --tags`) — nothing
   triggers automatically from the tag.
4. Run `Release` with `publish: false` on the tag/commit and download the
   `npm-packages` artifact. Interactively publish its five platform tarballs
   first and root tarball last with 2FA. This is the one-time bootstrap path;
   do not dispatch `publish: true` for `0.1.0`.
5. Configure the `release` Environment and npm Trusted Publishers as described
   above, then verify `npx @salient-data/lore@0.1.0 --version` from a machine
   that has never installed lore before, on a different platform from local
   development. Later versions use `publish: true` and pause for Environment
   approval before OIDC publishing.

## Dry-run rehearsal (verified)

The full dry-run path — everything up to but not including a real `npm
publish` — has been manually rehearsed end-to-end against this repo at
`version: "0.0.0"` (LORE-255), reproducing exactly what `release.yml`'s
`build` and `package` jobs automate:

- All five platform binaries compiled locally (`bun build --compile
  --target=<t>`, one per platform) — each well above the 1 MB
  EXDEV/0-byte-trap threshold `release.yml`'s `build` job checks; the
  darwin-arm64 one (matching the rehearsal host) executed natively and
  printed `--version` matching `package.json`.
- `npm publish --dry-run` for the root package (with a scratch `bin.lore`
  patch to `bin/lore.cjs`, reverted immediately after, exactly as the
  `package` job's pack step does) and for all five `npm/<platform>/`
  packages — every one reported the correct package name, version, file
  list (`bin/lore[.exe]` + `package.json` for the platform packages; `src/`,
  `bin/lore.cjs`, `README.md`, `LICENSE`, `package.json` for the root), and
  `access: public` with no auth error (dry-run doesn't require registry
  login). `npm publish --dry-run` does **not** report the `os`/`cpu` gate
  itself — that's asserted separately: structurally by `release.yml`'s
  `verify-versions` job (against the committed `npm/<platform>/package.json`
  `os`/`cpu` fields) and behaviorally by the `package` job's install-sanity
  step, which installs the platform tarball explicitly (not through
  `optionalDependencies` resolution) so a mismatch hard-fails `EBADPLATFORM`.
- A full `npm pack` of all six packages, installed together into a scratch
  project (root + the platform tarball matching the rehearsal host), then run
  via `node node_modules/.bin/lore --version`/`--help` — resolved through the
  real launcher (`bin/lore.cjs` → `require.resolve` → `spawnSync`) end to end,
  matching `package.json`'s version.

No `npm login`, token, tag, or `workflow_dispatch` was used or is required to
reproduce this — `--dry-run` alone exercises every check above. Re-run it the
same way (or via the actual `Release` workflow, `workflow_dispatch`,
default inputs) to re-verify before a real release; the version will no
longer read `0.0.0` once the [First-release checklist](#first-release-checklist)'s
version-bump item has happened.

## Rollback

- **Before publish**: nothing external happened — delete the tag, fix the
  issue, retry.
- **Bootstrap `0.1.0` failed partway**: do **not** bump the version or rebuild.
  Fix the account/access problem and resume with the same downloaded tarballs;
  skip any exact package versions already present. The root launcher is
  published last, so a platform-package failure leaves nothing installable.
- **A later OIDC publish job failed partway**: do **not** bump the version —
  fix the cause (usually a missing or mistyped Trusted Publisher) and
  re-dispatch `Release` with `publish: true` on the **same commit**. The
  publish step skips packages already on the registry and completes the rest.
  The launcher (`@salient-data/lore`) is published last precisely so a
  partial failure leaves nothing installable and the same version stays
  retryable. If the launcher itself published and something is still wrong,
  you cannot republish that version — cut `X.Y.Z+1` and `npm deprecate` the
  bad one (see below).
- **After a bad publish**: npm allows `npm unpublish` only within 72 hours and
  only if no other package depends on the version; prefer publishing a patched
  version and deprecating the bad one (`npm deprecate @salient-data/lore@X.Y.Z
  "broken release, use X.Y.Z+1"`) over unpublishing, which can break anyone who
  already installed it.
