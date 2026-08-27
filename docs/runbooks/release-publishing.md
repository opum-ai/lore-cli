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

This procedure describes how Lore ships as **seven** npm packages
(ADR-0001 §"Distribution"). It is not evidence that any package has been
published. Read [Lore CLI release truth](../reference/lore-cli-release-truth.md)
before acting or making an availability claim. The root package is
`@opum-ai/lore` (the thin Node `.cjs` launcher, `bin/lore.cjs`) plus six
per-platform binary packages published as its `optionalDependencies` —
`@opum-ai/lore-darwin-arm64`, `-darwin-x64`, `-linux-arm64`, `-linux-x64`,
`-win32-arm64`, and `-win32-x64`.

The `.github/workflows/release.yml` workflow (`workflow_dispatch`-only — it never
fires on a push or tag) first gates the release chain on a 15-minute bounded
LadybugDB qualification over a deterministic 100 MiB authored fixture and on
separate real-process concurrency/crash evidence. Six matching-host jobs then
prove native package installation, execution, and cleanup, after which a strict
`lore.ladybug-qualification-evidence/1` manifest hashes the benchmark, gate
policy, concurrency report, and all six package reports from the same clean
commit. Only then does the workflow **compile all six platform binaries,
assemble all seven packages, and prove the `npx`/launcher resolution mechanism
end-to-end** (LCLI-9/LCLI-283.1.4). The independent
`ladybug_scale_observation` input adds a non-blocking, 30-minute 1 GiB
observation; it never weakens or replaces the blocking gates. Only when a
maintainer manually dispatches with `publish: true` does the workflow
**publish all seven existing packages via npm OIDC Trusted Publishing**
(LCLI-255).

The initial `0.1.0` release is a one-time bootstrap exception: npm requires a
package to exist before a Trusted Publisher can be configured, and none of the
six names exists yet. The exact CI-built tarballs are therefore published
interactively with 2FA, platform packages first and root last; Trusted
Publishing is configured immediately afterward for possible later releases.
The owner has authorized the one-time interactive bootstrap while the
repository remains private; LCLI-278 still **blocks automated
`publish: true` dispatches** until an accepted out-of-file control is
configured. Without that control, an OIDC dispatch can publish without an
independent workflow-file-external approval. See the [First-release
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

- [x] **Verify the `@opum-ai` npm organization exists and the publishing
  account is an owner or member allowed to create public packages in that
  scope.** On 2026-08-03, the repository owner confirmed creating the
  independent `opum-ai` npm organization. Immediately before bootstrap, the
  interactive session authenticated successfully, proved owner permission,
  and reconfirmed all six exact `0.1.0` names were absent.
- [x] **Coordinated version bump: all six manifests + the 5
  `optionalDependencies` pins**, root `0.0.0` → `0.1.0` —
  [Step 3, item 2](#3-cut-a-release). This is exactly the 12 values
  `verify-versions` cross-checks (6 `version` fields + the 5 pins + the
  platform-set itself); a missed file fails loud there before any compile
  work runs, rather than silently skip-installing a platform package later.
- [x] **Flip `package.json`'s `bin.lore` from `src/cli.ts` to
  `bin/lore.cjs`**, for real, in the same commit as the version bump —
  [Step 3, item 1](#3-cut-a-release). This was completed for `0.1.0`; the
  release workflow now packs the committed launcher directly.
- [x] **CHANGELOG.md**: move the `[Unreleased]` section's entries under
  `## [0.1.0] - YYYY-MM-DD`, in the same commit as the version bump,
  so the tag below points at a commit whose CHANGELOG already reflects it.
- [x] **Merge to `dev`, promote to `main`, and wait for the full `main` CI
  matrix**, then tag the verified commit. Promotion PR #298 merged as
  `e621d209be2cc8867d1c38c7c78b4b4acc96d82e`; main CI run `30870114161`
  passed, and lightweight tag `v0.1.0` resolves directly to that commit.
- [x] **Dispatch `Release` with `publish: false`** on the tag/commit. Run
  `30870431925` passed all blocking gates and retained exactly six tarballs in
  `npm-packages`; the OIDC publish job was skipped.
- [x] **Bootstrap-publish the downloaded tarballs interactively with 2FA**:
  the five platform packages were published first and `@opum-ai/lore` last.
  Only the untouched workflow tarballs were used, and each immutable registry
  version was checked before any retry or advance.
- [ ] **Before any future automated publish, protect the existing `release`
  GitHub Environment** with the repository owner as required reviewer. The
  owner chose to keep the repository private for `0.1.0`, so the current plan
  cannot provide that rule; this item remains open under LCLI-278 and does not
  apply to the explicitly authorized interactive bootstrap.
- [x] **Configure npm Trusted Publishing for all six now-existing packages**,
  using repository `opum-ai/lore-cli`, workflow `release.yml`, Environment
  `release`, and allowed action `npm publish`. `0.1.0` does not use OIDC, and
  all six relationships were independently listed and verified. Later
  `publish: true` dispatches remain prohibited until LCLI-278 is Done.
- [x] **Post-publish smoke install**: a fresh npm project installed
  `@opum-ai/lore@0.1.0` from the public registry, resolved
  `@opum-ai/lore-darwin-arm64`, and returned `0.1.0` from the installed bin.
  Registry shasums matched the qualified publish results; Release run
  `30870431925` separately executed the same retained artifacts on all five
  matching hosts before publication.

### Script-free launcher installation

The next-release package contract keeps all JavaScript and LadybugDB
libraries in the repository's `devDependencies`. npm therefore installs only
`@opum-ai/lore`'s dependency-free CommonJS launcher and the matching compiled
platform package. macOS/Linux binaries embed the exact qualified Ladybug addon
through the committed `@ladybugdb/core@0.19.0` patch; Windows binaries
externalize the unreachable import and retain reference fallback. Do not move
those build dependencies back to `dependencies`: npm's global install-script
policy would again require users to approve `@ladybugdb/core`.

Each matching-host package job performs both a default isolated `npm install
--global` and a project-local tarball install. It rejects any lifecycle-script
approval diagnostic, proves the installed dependency graph contains no
`@ladybugdb/core`, runs the launcher, and requires the installed macOS/Linux
binary to build a native index. Windows must leave the native cache absent.
This is the release gate for the installation failure corrected after `0.1.0`;
the immutable `0.1.0` package itself may still require npm's
`--allow-scripts=@ladybugdb/core` exception.

## Prerequisites

- **Published Backlog.md JSON support (satisfied by LCLI-253).** Backlog.md
  `v1.49.0`, published 2026-08-02, is the first tagged release containing PR
  #790/BACK-545. Lore requires a published `backlog` binary at or past that
  version; the interim pinned-commit build is historical only. Reverify the
  installed binary and the live LCLI-253 evidence before release work.
- The `opum-ai` npm organization exists, separately from the GitHub
  organization, and the maintainer account can create public packages in the
  `@opum-ai` scope. Account-level 2FA is required for the interactive bootstrap
  publish and subsequent Trusted Publisher configuration; neither CI nor an
  agent can establish or infer this external ownership.
- npm CLI **>= 11.5.1** on any machine used for a manual/bootstrap publish
  (trusted publishing itself only requires this on the *publishing* side).
  In CI, `release.yml`'s `publish` job does not rely on whatever npm version
  the runner's Node happens to bundle: it explicitly runs `npm install -g
  npm@^11` and then asserts the `>= 11.5.1` floor before publishing
  anything.
- GitHub-hosted runners only — npm trusted publishing does not support
  self-hosted runners (`release.yml` already uses `ubuntu-latest`).

### Repo-admin setup for the release Environment (LCLI-268)

> **Current blocker (LCLI-278):** GitHub rejected creation of the
> required-reviewer rule because the repository's current billing/visibility
> combination does not support Environment required reviewers. A `release`
> Environment exists but has no effective protection rule. Reverify the live
> task and remote settings, then upgrade/change the plan or
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
(LCLI-268), which is the hook for that out-of-file control — but the
declaration by itself does **not** provide any protection yet. Two separate
pieces of repo-admin configuration have to exist before it does, and this
task (LCLI-268) deliberately does not perform either of them — creating a
GitHub Environment and its protection rules, and registering it with npm,
are both actions an agent must not self-authorize (the same boundary as
LCLI-196 and LCLI-257):

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
  (`gh api repos/opum-ai/lore-cli/rulesets/19698059`) — so any
  admin-level actor bypasses it outright regardless of what its rules say;
  check a ruleset's bypass list, not just its rules, before treating it as a
  substitute for required reviewers. **In this repo, today, that
  precondition does not hold**: `main` has no branch protection (`gh api
  repos/opum-ai/lore-cli/branches/main/protection` returns 404 "Branch
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
- [ ] **Set each package's npm Trusted Publisher "Environment
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
LCLI-268 is a necessary hook, not a complete mitigation on its own. Until
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

For `0.1.0`, Release run `30870431925` ran with `publish: false`; its exact
`npm-packages` tarballs were published interactively with 2FA. All five
`@opum-ai/lore-<platform>-<arch>` packages were published first and
`@opum-ai/lore` last. No local rebuild or repack was used.

After all six packages exist, configure **each package** (`@opum-ai/lore` and
the five `@opum-ai/lore-<platform>-<arch>` packages) with npm CLI 12 or the
equivalent npmjs.com Settings form. The CLI form used for `0.1.0` was:

```bash
npm trust github <package> \
  --repository opum-ai/lore-cli \
  --file release.yml \
  --environment release \
  --allow-publish \
  --yes

npm trust list <package> --json
```

For the npmjs.com form:

1. Open the package's Settings page → **Trusted Publisher** section.
2. **Select your publisher** → **GitHub Actions**.
3. Fill in (all fields are case-sensitive, exact-match):
   - **Organization or user**: `opum-ai`
   - **Repository**: `lore-cli`
   - **Workflow filename**: `release.yml` (exactly — the filename this repo's
     workflow already uses, so no rename is needed later)
   - **Allowed actions**: `npm publish`
   - **Environment name**: `release` — `release.yml`'s `publish` job now
     declares `environment: release` (LCLI-268). Setting this field makes
     npm's own OIDC verification require the resulting token to carry a
     matching `environment: release` claim, which only happens when the run
     actually deployed to a GitHub Environment named `release`. This is what
     closes the last loophole in the out-of-file gate described in
     [Repo-admin setup for the release Environment](#repo-admin-setup-for-the-release-environment-lcli-268)
     above: without this field set, an attacker who deletes the
     `environment:` line from a forged copy of `release.yml` mints an OIDC
     token npm would still accept, because nothing on npm's side required
     the claim in the first place.
4. Save.

Repeat for all six package names. For `0.1.0`, `npm trust list` independently
verified all six relationships as GitHub publishers with repository
`opum-ai/lore-cli`, file `release.yml`, Environment `release`, and
`createPackage` permission (the CLI representation of allowed action
`npm publish`). The next OIDC publish remains prohibited until LCLI-278 is
resolved; no `publish: true` run was used as a trust test.

`@opum-ai/lore-win32-arm64` was added after `0.1.0` and is not part of that
immutable six-package registry set. Before the first release containing it,
dispatch `Release` with `publish: false`, qualify the retained Windows ARM64
artifact on `windows-11-arm`, bootstrap-publish only that new platform package
interactively, and configure its Trusted Publisher with the same exact fields.
The normal platform-first publish loop is resumable and will skip that already
published `name@version` when the remaining packages are later published.

For `0.1.1`, Release run `30966913181` completed that seven-package path with
`publish: false`: all six matching-host qualifications passed, including
Windows ARM64, and artifact `8915160779` retained exactly seven tarballs. The
untouched platform tarballs were published interactively first and the root
launcher last. Anonymous registry metadata and a clean install then verified
all seven immutable versions before the non-draft GitHub Release was created.
The new Windows ARM64 package then received the same GitHub Actions Trusted
Publisher contract as the existing six packages. LCLI-278 still prohibits
`publish: true`; this manual release did not weaken or exercise the unsafe
automated path.

### 2. The `publish` job (already in `release.yml`)

After the interactive `0.1.0` bootstrap and trust configuration,
`release.yml`'s `publish` job publishes all seven packages via npm's OIDC-based
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
  release Environment (LCLI-268)](#repo-admin-setup-for-the-release-environment-lcli-268)).
- Declares `environment: release` (LCLI-268) — the out-of-file gate that
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
- Publishes **every platform binary package first, the root launcher last**.
  Root's `optionalDependencies` pin the six platform packages at an
  exact version, and `bin/lore.cjs` `require.resolve()`s them at runtime — if
  root published first, `npx @opum-ai/lore` could resolve a launcher
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
- Runs `npm publish` against each release tarball — no `NPM_TOKEN`/secret
  needed once Step 1's Trusted Publisher setup exists for that package; until
  then, that package's `npm publish` call fails with an auth/403 error, which
  is the correct "not ready yet" outcome, not a hazard.

Further wiring **is** needed before the first OIDC release: see [Repo-admin setup for
the release Environment
(LCLI-268)](#repo-admin-setup-for-the-release-environment-lcli-268) for the
two one-time, out-of-file steps (creating the `release` GitHub Environment
with required reviewers, and setting each package's npm Trusted Publisher
Environment name to `release`) that make the `environment: release`
declaration above actually protective rather than cosmetic. See the
[First-release checklist](#first-release-checklist) for the bootstrap sequence
and the handoff to OIDC.

**Scoped-package public access:** all seven `@opum-ai/lore*` packages are
scoped, and npm defaults a scoped package's first publish to
restricted/private access — it fails with an access-denied error unless the
publish is explicitly marked public. Root `package.json` and all six
`npm/<platform>/package.json` manifests already carry `"publishConfig": {
"access": "public" }` for this reason, so a plain `npm publish` (no
`--access` flag needed) succeeds; if that key is ever removed, pass
`--access public` explicitly to `npm publish` for all seven packages instead.

### 3. Cut a release

1. **For the initial release, flip `package.json`'s `bin.lore` from
   `src/cli.ts` to `bin/lore.cjs`.** `0.1.0` completed this trigger; subsequent
   releases keep `bin/lore.cjs` and must not revert to the source entry point.
2. Bump `version` in `package.json` and all six `npm/<platform>/package.json`
   files to the same new value, **and update root `package.json`'s six
   `optionalDependencies` pins to that same exact version**, in one commit —
   `release.yml`'s `verify-versions` job (which `build` depends on and
   therefore gates) asserts all seven versions, plus the `optionalDependencies`
   pin and `license`/`author`/`repository` metadata, are consistent before
   compiling anything, so a missed file fails loud here rather than silently
   skipping an optional dependency later.
3. Keep the README's copyable install commands versionless (`npx
   @opum-ai/lore`, `bunx @opum-ai/lore`, and package-manager installs without
   an `@<version>` suffix), so they continue to resolve the current release
   instead of retaining the previous release's exact pin. Reconcile the
   README's stated current version and install behavior with this version bump;
   immutable historical evidence keeps its exact versions in the release-truth
   record rather than in the install examples.
4. Merge to `dev`, promote to `main`, and wait for the full `main` CI matrix.
   Tag that verified commit and push the tag — nothing triggers automatically
   from the tag.
5. Until LCLI-278 supplies an effective external approval control, dispatch
   `Release` with `publish: false` on that tag. Download only its
   `npm-packages` artifact, list and checksum the seven `.tgz` files, then
   interactively publish those exact artifacts with 2FA: all six platform
   packages first and `@opum-ai/lore` last. Do not run `npm pack` locally or
   publish a rebuilt tarball. The workflow artifacts are the qualified release
   inputs.
6. Verify every `name@version` in the registry and use a new temporary
   directory for a clean `npx @opum-ai/lore@<version> --version` install/run.
   Record the artifact run, registry, and clean-install evidence in the
   release-truth record. Later versions may use `publish: true` only after
   LCLI-278 is Done; until then, OIDC publication remains prohibited despite
   the valid npm trust relationships.

### 4. RC dist-tag publication (release-candidate, non-promoting)

This procedure publishes a qualified release **candidate** to npm under the
`release-candidate` dist-tag. It exists because the step-3 flow above ends in
a stable `latest` publication and requires `main` promotion plus a Release
workflow run — controls that belong to calling a version *released*. An
`release-candidate` publication is explicitly not a release claim: the
"Evidence required to call Lore released" list in
`docs/reference/lore-cli-release-truth.md` still governs that designation,
and this procedure must never touch `latest`, `main`, or production channels.

1. **Authority.** Requires an explicit, recorded direct-user/Controller order
   for the exact candidate. Never self-authorize a `release-candidate` publication.
2. **Qualified inputs.** Publish only the immutable candidate family recorded
   in `docs/reference/lore-cli-release-truth.md` for the target version — the
   staging directory, family manifest SHA-256, per-package byte sizes,
   SHA-256 digests, SHA-512 SRI integrity values, and source commit are the
   provenance record. Verify every tarball against the manifest immediately
   before publishing and never repack locally. (The step-3 workflow-artifact
   rule remains the standard for stable releases; for `release-candidate` publication the
   dev-recorded release-truth family is the qualified-input provenance.)
3. **Order and command.** All six platform packages first, the root launcher
   last, each as an exact tarball path:

   ```sh
   npm publish <path-to-tarball>.tgz --access public --tag release-candidate \
     --registry=https://registry.npmjs.org
   ```

   `publishConfig.access` is already `public`; the flag is kept explicit per
   the `0.1.0` interactive-publication precedent.
4. **`latest` protection.** After publishing, verify `npm view <pkg>
   dist-tags --json` for all seven packages: `release-candidate` resolves to the candidate
   version and `latest` is unchanged.
5. **Auth and OTP fail-closed.** Use the ambient authenticated npm CLI without
   reading `npmrc`, environment variables, or token material. If npm issues a
   web/OTP challenge, never display, request, or store OTPs, tokens, or auth
   URLs; retry at most once inside a single bounded `--auth-type=web` window;
   if that does not complete, fail closed and prove no partial state across
   every package and dist-tag.
6. **Evidence.** Record packument integrity, dist-tag state, clean-consumer
   install, and CLI smoke results in the release-truth record and the relevant
   Backlog task notes through a normal PR to `dev`.

## Dry-run rehearsal (verified)

The full dry-run path — everything up to but not including a real `npm
publish` — has been manually rehearsed end-to-end against this repo at
`version: "0.0.0"` (LCLI-255), reproducing exactly what `release.yml`'s
`build` and `package` jobs automate:

- All five platform binaries compiled locally (`bun build --compile
  --target=<t>`, one per platform) — each well above the 1 MB
  EXDEV/0-byte-trap threshold `release.yml`'s `build` job checks; the
  darwin-arm64 one (matching the rehearsal host) executed natively and
  printed `--version` matching `package.json`.
- `npm publish --dry-run` for the root package (with the pre-`0.1.0` scratch
  `bin.lore` patch to `bin/lore.cjs`, reverted immediately afterward; current
  source already commits that launcher) and for all five `npm/<platform>/`
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
  The launcher (`@opum-ai/lore`) is published last precisely so a
  partial failure leaves nothing installable and the same version stays
  retryable. If the launcher itself published and something is still wrong,
  you cannot republish that version — cut `X.Y.Z+1` and `npm deprecate` the
  bad one (see below).
- **After a bad publish**: npm allows `npm unpublish` only within 72 hours and
  only if no other package depends on the version; prefer publishing a patched
  version and deprecating the bad one (`npm deprecate @opum-ai/lore@X.Y.Z
  "broken release, use X.Y.Z+1"`) over unpublishing, which can break anyone who
  already installed it.
