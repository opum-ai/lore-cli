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
  `name@version` is already on the registry (`npm view`) and skips it only
  if the registry holds this run's bytes, compared by `dist.integrity`. A
  package already there with other bytes fails the job and is never skipped.
  Only npm's own not-found (E404) counts as "not published": any other
  `npm view` failure fails the job rather than being read as absent.
  Resuming after a partial failure therefore finishes the remaining packages
  instead of 403ing (`EPUBLISHCONFLICT`) on the ones already published — see
  [Rollback](#rollback)'s "Publish job failed partway" entry for which run to
  resume from.
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

**Every release is a pair (constitution Article 3, LCLI-613).** `lore` and
`quest` are versioned and released as one unit, ratified in opum-agent's
`docs/reference/opum-project-constitution.md`. Six steps, in this order. The
numbered items after them are the lore side's detail.

1. **Both `main`s read the same version.** lore-cli's and quest-cli's
   `package.json` on `main` carry the same number (clause 1) before either side
   tags. Items 1 to 4 below.
2. **The parity gate.** Before any registry write, `--dry-run` included, both
   `scripts/publish-release.sh` and `release.yml`'s `publish` job run
   `scripts/version-parity.mjs`. `release.yml` also runs it in its own
   `version-parity` job on every dispatch, `publish: false` included, and
   `publish` needs that job (LCLI-620). Before LCLI-620 a `publish: false`
   rehearsal skipped the check along with the `publish` job. A consequence: a
   `publish: false` re-run on an old tag goes red once quest-cli `main` has
   moved to a new number. That red is the gate working, not a broken build. It reads `@opum-ai/quest`'s `package.json` on
   quest-cli `main` through the GitHub contents API and refuses unless its
   `name` is `@opum-ai/quest` and its `version` equals the lore version being
   published (clause 6). The refusal names both versions, both refs and the
   clause. A read that fails refuses exactly like a mismatch: a 404, a network
   error, malformed JSON or a missing version. There is no override flag or
   variable. quest-cli runs the mirror against lore-cli, and the rule is theirs
   (`scripts/qualification/version-parity.mjs`, QCLI-386). `test/version-parity.test.ts`
   runs both implementations side by side.
3. **`release-candidate` staging.** Both sides publish all seven packages
   under `--tag release-candidate` only. Nothing moves `latest` at publish
   time (clause 5). On lore's side the six platform packages stage at `X` and
   the root launcher stages at `X-rc.N`; see "The launcher stages as
   `X-rc.N`" below. Item 5.
4. **The opum-cli-e2e pair receipt.** opum-cli-e2e installs the staged pair
   from the registry, by exact version rather than by dist-tag, and lands
   `receipts/pair/<version>.json` on its `main`. The contract is its
   `receipts/README.md`, sections "Pair receipts" and "What a reader must do".
5. **`latest` moves quest first, then lore, on opum-agent's go.**
   `scripts/promote-latest.mjs` refuses without a verifying pair receipt. It
   records every package's prior `latest` before it moves anything, and it
   restores them on a failure or on `--rollback`. The platforms move by
   dist-tag, and the launcher's `X` is published to `latest`, last. Item 7.
6. **The post-latest checklist follows the `latest` move**, including the
   LCLI-469 marketplace handshake: `opum-marketplace` holds its pins until
   `latest` moves, then bumps `opum-lore` and `opum-quest` together in one
   change (clause 4). `scripts/promote-latest.mjs` prints the list. Item 8.

A staged version is **not released**. Until item 7 has run, `latest` still
names the previous release, and a bare `npx @opum-ai/lore` installs that
previous release.

**The launcher stages as `X-rc.N` (constitution Article 3 clause 5 as amended
by ODOC-302, LCLI-621).** The root launcher `@opum-ai/lore` reaches `latest`
by a fresh publish of `X`, never by a dist-tag move, so what is qualified is a
prerelease `X-rc.N` and what ships is a separate tarball. The staging half
works like this:

- **Eight tarballs, seven staged.** The `package` job's `npm-packages`
  artifact carries the six platform tarballs at `X`, the launcher at `X-rc.N`
  and the launcher at `X`. Staging, by `release.yml`'s `publish` job or by
  `scripts/publish-release.sh`, publishes the six platforms at `X` and the
  launcher at `X-rc.N`, all under `--tag release-candidate`. The `X` launcher
  is carried in the artifact and never staged. `package.json` on `dev` and
  `main` stays at `X`, so the version-parity gate is unchanged.
- **`N` is the `launcher_rc` dispatch input.** It is a positive integer with
  no leading zero, and it defaults to `1`, because the first staging of any
  `X` is `rc.1`. A re-stage of the same `X` must pass the next `N`: an
  `X-rc.N` already on the registry cannot carry new bytes. A re-stage works
  only if the new run's platform tarballs are byte-identical to the `X`
  platforms already on the registry (see the next item). That has been
  measured once: two Release dispatches on the same commit `20a1d24b` (0.6.1,
  runs 34783940117 and 34786808767) produced seven byte-identical tarballs.
  From a different commit it is unmeasured. The script reads
  `N` from the artifact, where the run holds exactly one `X-rc.N` launcher. It
  refuses to resume past an `X-rc.N` whose registry bytes differ from the
  run's, and names the next `N` as the remedy. Both staging paths make that
  check for all seven packages in a pre-flight, before the first write.
- **A new `N` does not fix a platform package.** Every `X-rc.N` pins the
  platforms at exactly `X`, and `X` platform packages are immutable. Both
  staging paths compare an already-published platform package's
  `dist.integrity` with the run's tarball and refuse on a difference, because
  a re-stage from a new Release run rebuilds the platforms and the rebuild is
  not proven byte-identical. The remedy is to publish from the Release run
  whose platform tarballs the registry holds, or to cut a new version. Never
  unpublish.
- **How the rc launcher is built.** The `package` job rewrites only
  `package.json`'s own `version` line to `X-rc.N`, so the six
  `optionalDependencies` still pin exactly `X`. It re-renders README's
  `lore-version` blocks for `X-rc.N` with `scripts/shipped-readme-version.mjs`
  and runs `npm pack`. Then it restores both files and asserts the restore.
  The rc README names the rc's own version. That is why the LCLI-510
  `--tarball` assertion holds unchanged for both launchers, and it runs
  against both.
- **The equivalence gate.** `scripts/launcher-equivalence.mjs` compares the
  two launchers entry by entry over the unpacked tarballs. They must hold the
  same set of paths, and each entry must have the same type and mode. Each
  entry's content must be byte-identical once every `X-rc.N` is replaced with
  `X`. Whole tar or gzip bytes are never compared. It also refuses an rc whose
  own `package.json` is not `X-rc.N`, a final not at `X`, and an rc pinning a
  platform at anything but `X`. It runs in the `package` job before the
  artifact uploads, and again in `scripts/publish-release.sh` before any
  registry write.
- **Install-sanity runs for both launchers.** `lore --version` prints `X`
  through either one, because the platform binary answers it. Each launcher's
  own installed `package.json` must name its own version, `X` or `X-rc.N`, and
  pin the platforms at `X`.

The final `X` launcher's `--tag latest` publish, gated on both receipts, is
the promotion half, item 7. It is not part of staging.

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

   **In that same commit, also bump `.claude-plugin/plugin.json`'s `version`
   to the same value.** `0.4.3` shipped without this: the bump touched the
   seven npm manifests and not the plugin manifest, so the marketplace pin
   moving to `v0.4.3` still resolved as `0.4.2` everywhere — Claude Code's
   plugin-update resolution reads `plugin.json`'s own version, not the git
   tag, so a pinned tag whose plugin.json did not move is invisible to every
   installed copy. `test/plugin-manifest.test.ts` (LCLI-447) fails the moment
   the two disagree, so this is caught by `bun test` before the release
   commit is even pushed — but do it here, in the same commit as the other
   seven, rather than relying on the test to catch a forgotten one.

   **In that same commit, regenerate `bun.lock` — with the PINNED Bun.** The
   root's `optionalDependencies` pins move with the bump, and a lockfile still
   resolving the previous version fails `bun install --frozen-lockfile` in
   `setup-bun`, which kills **every** CI job before any gate runs: eight red
   checks with one cause and no test output to read.

   It does not fail immediately, which is the trap. At bump time the new
   platform packages do not exist on the registry yet, so nothing can resolve
   them and the drift is invisible — the 0.3.5 bump passed CI repeatedly and
   only broke *after publication made the pins resolvable* (LCLI-369). Use the
   version in `.bun-version`, not whatever Bun is on your PATH: a different Bun
   writes a different lockfile shape and fails the frozen check a second time
   for a new reason. Verify with `bun install --frozen-lockfile`, exit code
   taken without a pipe.

   **A forgotten regeneration is caught on the bump's own pull request**
   (`bun run check:lockfile-pins`, LCLI-544): ci.yml's package-set job compares
   `bun.lock`'s platform pins against root `package.json`'s
   `optionalDependencies` on every pull request, and `release.yml`'s
   `verify-versions` runs the same script before any compile work. The check is
   a pure file comparison for exactly the reason the trap above exists: the
   assertion that would catch a stale lockfile by *resolving* it cannot run
   before the publish that makes it resolvable, so `--frozen-lockfile` agrees
   with a lockfile that is already wrong. The pins are the one version site
   `verify-versions`' field comparison cannot see.

   **In that same commit, refresh the three version-bearing Ladybug digest
   baselines.** The bump alone turns the suite red, because the canonical
   export embeds `lore/<version>` as provenance, so the export digest moves on
   every release while nothing about the fixture content changes. This has now
   caught three releases running (LCLI-338, LCLI-349, and the 0.3.5 cut), which
   is why it is written down rather than rediscovered:

   - `benchmark/ladybug/fixtures/v1/small.json` → `expected.canonicalExportSha256`
   - `benchmark/ladybug/fixtures/v1/large.json` → `expected.canonicalExportSha256`
   - `test/ladybug-benchmark-report.test.ts` → the `benchmarkDigest(json)`
     baseline, which is downstream of the two above and moves with them.

   Take the new values from the failure output — `bun test
   test/ladybug-benchmark-fixture.test.ts` prints the expected/received pair —
   then re-run the fixture suite and the report test.

   **Prove the change is version-driven before you refresh anything.**
   Refreshing a digest baseline is precisely the edit that can bury a real
   regression under a "just the version bump" commit message, and a refreshed
   baseline is indistinguishable from a correct one afterwards. Two checks,
   both cheap:

   - **Only `canonicalExportSha256` may move.** If `sourceInventorySha256` or
     `taskSnapshotSha256` also changed, the *content* changed and you are
     looking at a code regression, not a version bump. Stop and find it.
   - **Negative control.** Revert only the root `package.json` version string
     to the previous release, leaving all other source untouched, and re-run
     `bun test test/ladybug-benchmark-fixture.test.ts`. It must return to
     passing against the OLD baselines. If it does not, something other than
     the version moved the digest. Restore the new version afterward.

   **Choose the bump with the breaking-bump gate (LCLI-632, mirror of
   quest-cli QCLI-328).** A breaking CHANGELOG entry needs at least a minor
   bump, and because lore and quest share one version, a break in either
   changelog forces the pair's. Run `bun run check:breaking-bump -- --next
   <new-version>` before the bump: it checks `CHANGELOG.md`'s `[Unreleased]`
   section (or the `## [<new-version>]` section once the entries move below)
   for a `### ... (breaking)` heading and for the legacy bold
   `**BEHAVIOUR CHANGE:**` marker, which fails at any bump level and names the
   canonical heading, and it reads quest-cli's `CHANGELOG.md` by ref
   (default `dev`) the same way — an unreadable quest changelog refuses too.
   `release.yml` runs the same checker as its `breaking-bump` job on every
   dispatch, reading quest-cli `main`; the `publish` job needs it, like the
   version-parity job.

   **The bump to X also needs quest X published and declared, or CI cannot run
   lore at all (LCLI-650, the runtime pair lock).** `lore check` drives the
   installed `quest`, and the lock refuses any quest that is not exactly lore's
   own `package.json` version; the docs gate installs the version CLAUDE.md's
   managed block declares. So the commit that bumps `package.json` must move
   the declared Quest version in CLAUDE.md to X in the same change, and quest X
   must already be on npm by the time that PR's checks run — under Article 3's
   staged pair release the quest side publishes first. A lore bumped ahead of
   its quest cannot go green anywhere, and that is the lock working, not a
   flake to retry.

3. Regenerate the README's version-bearing lines **in the same commit as the
   version bump, before the tag**:

   ```sh
   node scripts/shipped-readme-version.mjs --write
   node scripts/shipped-readme-version.mjs --check   # exit 0
   ```

   **This replaced "reconcile the README's stated current version", and the
   replacement is the fix for LCLI-510 rather than a rewording.** That
   instruction was already in this step, and the defect happened anyway:
   `npm view @opum-ai/lore@0.7.0 readme` served a README asserting `0.6.2` on
   three lines. The instruction lost to a structural tension it could not
   resolve — a sentence saying "0.7.0 is released" cannot honestly be written
   before 0.7.0 is released — and `scripts/publish-release.sh`'s own closing
   message told the operator to do it *after* publishing, so the two
   instructions disagreed and the post-publish one won every time. Generating
   the number removes the tension: the generator states a fact about the
   artifact, not a claim about the world, so it can be written at any moment.

   The release refuses to publish when the packed README disagrees with the
   packed `package.json` — `scripts/publish-release.sh` checks it before any
   registry write, and `release.yml`'s `package` job checks the tarball it
   packs. **Both read the file out of the tarball, never the worktree**, because
   a worktree check can pass while the packed file is stale and the packed one
   is what the registry serves. Contract: `opum-ai/opum-doc`
   `docs/reference/shipped-readme-version-assertions.md` at main@ba3055d; this
   repository's per-clause record is
   [Shipped-README version assertions in lore-cli](../reference/shipped-readme-version-record.md).

   **After publishing, what you read back is npm's package-level `readme`
   field, not a per-version page.** Measured 2026-09-15:
   `npm view @opum-ai/lore@0.7.0 readme`, `...@0.6.2 readme` and
   `...@0.6.1 readme` all return the same 14446 bytes — npm serves whatever the
   most recent publish carried, and the version in the spec is inert. So a
   read-back that disagrees within the propagation window (LCLI-460: 0.5.0 took
   ~25 minutes) is most likely the registry still serving the *previous*
   release, not a defect. `scripts/readme-readback.sh` automates that
   distinction. `scripts/promote-latest.mjs` runs it once, after the final `X`
   launcher is published to `latest` (item 7), against that tarball's own
   `package.json` and `README.md` (LCLI-616). It retries for
   `REGISTRY_WINDOW_SECONDS` (default 1800). It ends in one of three verdicts,
   printed as its last line (`A4 VERDICT: PASSED|NOT-CONFIRMED|FAILED
   <reason>`). It is FAILED when the served page satisfies neither this
   release's assertions nor the previous release's. An empty `readme` after the
   whole window is settled by one packument read of `readme` and `versions`. A
   lagging replica serves the packument as it stood before the publish, and
   that can be empty: `@opum-ai/lore`'s has had no `readme` since 0.11.0
   (OPAG-474), so the next release will lag through an empty field. So empty is
   FAILED (the OPAG-474 defect) only when the same read already lists this
   version. If that read carries a non-empty `readme`, it is compared exactly
   as an in-window read would be: PASSED when it is byte-equal or satisfies
   every assertion, NOT-CONFIRMED when it is the previous release's, FAILED
   otherwise (LCLI-626). Otherwise lag is not ruled out, and the verdict is
   NOT-CONFIRMED. A `readme` holding only newlines counts as empty.
   Record the package and the time you read, never "the page for version X" —
   naming an object you did not read is the defect class this whole gate exists
   to close.

   Keep the README's copyable install commands versionless (`npx
   @opum-ai/lore`, `bunx @opum-ai/lore`, and package-manager installs without
   an `@<version>` suffix), so they continue to resolve the current release
   instead of retaining the previous release's exact pin. Immutable historical
   evidence keeps its exact versions in the release-truth record rather than in
   the install examples.

   **`docs/index.md` names no version, deliberately — do not add one back**
   (LCLI-361). It is the first paragraph a reader or agent meets, so a stale
   number there is the most-read wrong fact in the bundle, and a version pinned
   in prose goes stale on every release. It points at
   [Lore CLI release truth](../reference/lore-cli-release-truth.md) instead.
   That reference is the one file in `docs/` that carries the current published
   version; update it here, and leave every other in-bundle mention historical
   and dated. Before finishing a release, re-run the sweep that proves no second
   file has grown a current-state version claim — take its exit code without a
   pipe, and treat any hit outside the release-truth record as a defect:

   ```
   grep -rn --include='*.md' -E '@opum-ai/lore@[0-9]' docs/ \
     | grep -v 'reference/lore-cli-release-truth.md'
   ```

   Classify by what the sentence *claims*, never by which directory it sits in —
   a directory exemption is a hand-scoped list wearing a costume, and an ADR can
   grow a stale current-state claim just as easily as the index did. The test:
   **does the sentence assert what is published now, undated?** If yes it is a
   defect, wherever it lives. If it names a version *as of* a stated date, or as
   the subject of a past release, it is a record and is fine.

   The sweep is not expected to come back empty. Its exemptions are pinned here
   hit by hit, so a twelfth hit appearing is a visible failure rather than a
   silent one. **Count the output lines and compare them with this list.
   Eleven lines, in these four files, is the passing answer**:

   - `docs/runbooks/release-publishing.md`, 3 hits:
     - the `0.1.0` post-publish smoke evidence. A checked checklist result
       about one specific past release.
     - step 3's LCLI-510 narrative, where npm's `0.7.0` read served a README
       asserting `0.6.2`. Past tense, about a past release's defect.
     - step 3's read-back note, the `0.7.0`/`0.6.2`/`0.6.1` `readme` reads.
       Prefixed "Measured 2026-09-15", so it is a dated measurement.
   - `docs/adr/0020-tracker-version-gates-are-minimum-floors.md`, 1 hit: the
     `0.3.4`/`0.2.9` pairing that motivated the floor decision, written "as
     observed on 2026-08-28". A dated observation, not a current-state claim.
   - `docs/reference/shipped-readme-version-record.md`, 7 hits:
     - "On 2026-09-15", the `0.7.0` README defect. A dated measurement.
     - the byte-wise masking section's stale `0.6.2` example. A hypothetical
       the gate must catch, not a claim about what is published.
     - the clause-3 section's planted `0.6.2`. A hypothetical proof input, as
       above.
     - the allow-span example sentence, that `0.6.0` was the last release
       carrying a provenance attestation. It is quoted as history, but **its
       truth depends on the present**. It was re-verified on 2026-09-22:
       `0.6.1`, `0.6.2`, `0.7.0`, `0.8.0` and `0.9.0` have no `dist.attestations`
       key. It becomes false the first time LCLI-482's fix ships an attested
       release, so re-read it then.
     - three lines of the "Measured 2026-09-15" `npm view ... readme` block.
       A dated measurement.

   Any hit that is not one of those eleven is a defect to fix before
   releasing. This sweep was proven by a negative control on 2026-08-29: a planted
   `@opum-ai/lore@<a-version-that-does-not-exist>` line in
   `docs/reference/cli-surface.md` was reported by
   path and line, and the sweep returned to its pinned rows once removed.

   **Re-pinned 2026-09-22 (LCLI-567), after the list had silently stopped
   matching.** Until then this list pinned two rows while the sweep returned
   eleven. The nine unpinned hits all arrived with LCLI-510 (#118) on
   2026-09-15, and every one of them is a record rather than a defect. But
   `0.8.0` and `0.9.0` both shipped with a sweep whose output no longer matched
   its own exemption list. That is the silent failure pinning exists to
   prevent, and it went unseen because nobody compared the count. Run the
   sweep with `/usr/bin/grep`, not a shell `grep` that may be a shim skipping
   gitignored files. Both returned 11 on 2026-09-22, but a shim is not the
   command this list was measured with.
4. Merge to `dev`, promote to `main`, and wait for the full `main` CI matrix.
   Tag that verified commit and push the tag — nothing triggers automatically
   from the tag.

   **In the same sitting, tell `opum-marketplace` the new tag and the resolved
   `skills/` tree SHA** (LCLI-469). This is the one release step whose effect
   lands in another repository, and it fires **on the tag** rather than on the
   publish, so it is due here and not after step 6. That message carries the
   values; the pin bump itself waits for `latest` to move, which is item 8. `opum-marketplace` pins this
   repository by tag and independently re-resolves the federation chain — tag
   ref → tag object → commit → root tree → `skills/` subtree — comparing the
   result against a recorded baseline. Their check runs on a daily schedule and
   on pushes to their own `dev`/`main`, not only when their `marketplace.json`
   changes, because a tag can move without their repository changing at all. So
   a red check can surface over there with nobody having touched anything.

   The two concrete files are named here rather than left as "their federation
   check", because an abstract contract that never names the file implementing
   it is invisible to whoever deletes that file:

   - `opum-marketplace` `scripts/check-federated-content.mjs` — performs the
     resolution and the comparison.
   - `opum-marketplace` `scripts/federated-pin-baselines.json` — holds the
     recorded `skills/` SHA per federated plugin (`opum-lore` here;
     `opum-quest` is the adjacent row).

   Resolve the four values and send them; do not make them re-derive it:

   ```
   git rev-parse v<version>                  # the tag object SHA
   git rev-parse v<version>^{commit}         # the commit it peels to
   git ls-tree v<version> skills             # the resolved skills/ tree SHA
   ```

   **The passing case is real and is the common one: re-tagging over
   byte-identical `skills/` content needs no marketplace change at all.** The
   baseline records a *content* SHA, not a tag, so a new tag whose `skills/`
   subtree is unchanged resolves to the same value and their check stays green
   untouched — a pin re-point that does not change the skill is a marketplace
   no-op. Send the values anyway; letting them confirm a no-op costs one message
   and is how the offer was framed. What must not happen is the other case going
   unsent: when `skills/` **has** moved, their pin bump has to carry the
   re-resolved baseline in the **same** change, or their check goes red.

   Compare against the previous tag before sending, so you know which case you
   are in and can say so:

   ```
   git diff --stat <previous-tag> v<version> -- skills/
   ```
5. Until LCLI-278 supplies an effective external approval control, dispatch
   `Release` with `publish: false` on that tag, setting `launcher_rc` (see "The
   launcher stages as `X-rc.N`" above). Download only its `npm-packages`
   artifact, list and checksum the eight `.tgz` files, then stage seven of
   those exact artifacts: all six platform packages first and `@opum-ai/lore`
   at `X-rc.N` last. The `X` launcher stays in the artifact. Do not run
   `npm pack` locally or publish a rebuilt tarball. The workflow artifacts are
   the qualified release inputs.

   **Use `scripts/publish-release.sh`** rather than typing the sequence by
   hand — it encodes this step's ordering and refusals:

   ```
   scripts/publish-release.sh <version> <run-id> --dry-run
   scripts/publish-release.sh <version> <run-id>
   ```

   **Its first remote read is the lore/quest version-parity gate (LCLI-613).**
   Only argument validation and the window/cushion check below precede it,
   and neither reads anything remote. It runs
   before any artifact, digest, receipt, credential or registry step, and in a
   `--dry-run` too, so a rehearsal cannot read green over a mismatched pair. The
   lore side is the `<version>` argument, because the script publishes a Release
   run's tarballs rather than the checkout it runs in. It needs your `gh` login
   to read quest-cli `main`. Two paths are exempt, because neither writes
   anything: `--print-checklist`, and `--verify-only`, which must still answer
   when GitHub is unreachable.

   **`REGISTRY_WINDOW_SECONDS` and `PROPAGATION_CUSHION_SECONDS` must be whole
   seconds (LCLI-629):** 0 to 999999999, no leading zero, and no unit suffix
   such as `30m`. `scripts/publish-release.sh` refuses anything else with exit
   2 before the version-parity read, any download, or any registry call, dry
   run included, while `--verify-only` and `--print-checklist` ignore both.
   Unset or empty means the defaults, 1800 and 20. Unchecked, a window of `30m`
   skipped the visibility gate and staged the launcher over a platform package
   that never became visible, and `abc` exited 0 after six platform publishes.

   **The window is one grammar with five readers, and `.github/workflows/release.yml`
   now refuses it before it publishes (LCLI-634).** The readers are
   `scripts/publish-release.sh` (the window and the cushion),
   `scripts/readme-readback.sh`, `scripts/promote-latest.mjs`, release.yml's own
   post-publish visibility wait, and `scripts/release-provenance.mjs`, which
   receives `PROVENANCE_WAIT_SECONDS` as `--wait-seconds`. Two release variables
   drive them: `vars.REGISTRY_WINDOW_SECONDS` (default 1800) and
   `vars.PROVENANCE_WAIT_SECONDS` (default 180), both 0 to 999999999, no leading
   zero, no unit suffix. An always-running `release-window` job refuses a
   malformed value with exit 2 — naming the variable and showing the value
   escaped — and the `publish` job needs that job, so a `publish: false`
   rehearsal refuses exactly what a real publish would and the refusal lands
   before the first publish rather than after the last one. The `publish` job
   refuses its own environment-resolved value as well, ahead of its first
   publish: a job sees a release-environment variable only by declaring
   `environment: release`, which only that job does. Set
   `PROVENANCE_WAIT_SECONDS` at the repository or organisation level —
   `provenance-post` declares no environment, so an environment-level value for
   it is never read. Before LCLI-634 that variable reached `--wait-seconds` as a
   `parseInt`, so `30m`, `08` and `1e3` were silently a 30, an 8 and a 1 second
   window, and only `abc` was refused — after the release had published.

   **It stages, and it never moves `latest` (LCLI-613).** Every `npm publish`
   carries `--tag release-candidate`. A publish with no `--tag` moves `latest`
   as a side effect, which is why the flag lives in the one argument list every
   publish goes through. The dry run prints that list, tag included. The step
   that used to move `latest` at the end of every publish is gone. What remains
   points `release-candidate` at the version for any package the run skipped as
   already published, because a resumed package did not get this run's `--tag`.
   `test/publish-release-script.test.ts` records every argv the script hands to
   npm and fails on any write that names `latest`. The closing install smoke
   runs `npx @opum-ai/lore@<version>` by exact version. The bare name resolves
   `latest`, which now still names the previous release, so smoking it would
   test the wrong build and pass. Since LCLI-621 the exact version is the staged
   launcher's, `npx @opum-ai/lore@<version>-rc.N`.

   **There is no longer a `gh run download` step to run first.** The script
   downloads the `npm-packages` artifact itself when the directory is absent or
   short of the eight tarballs. It does **not** resolve a run attempt: since
   LCLI-487, `release.yml` names artifacts by run id alone, with
   `overwrite: true`, so a run has exactly one set. The per-platform
   qualification reports are matched by `ladybug-package-qualification-*-<run-id>*`,
   which also finds the `-<run-id>-<attempt>` names of runs qualified before
   2026-09-14. If such a run had more than one attempt, two reports match one
   platform, and the script refuses to guess and names both. During the `0.6.2`
   release the operator was stopped three separate times by prerequisites the
   script had already diagnosed precisely and then declined to perform; it now
   performs them (LCLI-489).

   **It hard-refuses to publish without a qualification receipt (LCLI-578).**
   After the digest checks and before any credential or registry step, it reads
   `receipts/lore/<version>.json` from `opum-ai/opum-cli-e2e` `main` with your
   `gh` login. The contract for that file is `receipts/README.md` in the same
   repository. It refuses unless the receipt's `kind`, `product`, `version` and
   `releaseRunId` match, its `tarballs` name exactly the seven files being
   staged, the `X-rc.N` launcher among them, and each sha256 matches the file
   handed to `npm publish`. The receipt must never name the carried `X`
   launcher in `tarballs`, even at its true digest. Its identity lives only in
   `launcherSubstitution.finalTarball`, and an eight-entry receipt refuses
   (opum-cli-e2e `receipts/README.md` at `e0021c7`, which superseded
   `4f078e6b` on this point). Since LCLI-621 the receipt must also carry the
   fields opum-cli-e2e requires from TASK-126 on. `launcherVersion` must be this
   run's `X-rc.N`. `launcherSubstitution` must be `MATCH` with no mismatches,
   and no `override` waives a `MISMATCH`. Its `finalTarball` must name the
   bare basename `opum-ai-lore-<X>.tgz`, never a path, at the carried
   launcher's sha256. A receipt without them refuses. The rule is
   `scripts/pair-receipt.mjs`'s `evaluateReleaseReceipt`, the same one
   `scripts/promote-latest.mjs` re-runs at promotion, so a receipt that stages
   cannot then be refused at promotion for these fields. Only promotion binds
   the receipt's `commit`, because lore has no tag to peel at staging. The
   verdict must be `QUALIFIED`, or the receipt must carry a complete `override`
   (`by`, `reason`, `task`, `adr`), which is printed verbatim. A 404 or 403
   means no receipt, and the script refuses without retrying. No flag or
   environment variable the script reads bypasses the gate. The host, repository
   and ref are pinned: the read passes `--hostname github.com`, so `GH_HOST`
   cannot redirect it. If the checker's output is anything other than a
   recognised verdict, the script refuses. The only way past a non-qualifying
   verdict is an override landed in the receipt by pull request. `--dry-run`
   prints the receipt verdict. If the receipt would be refused, the dry-run
   stops there and exits non-zero. So, before publishing, wait for
   opum-cli-e2e to land the receipt on its `main`. It appears minutes after the
   pull request merges.

   **What the digest check proves, stated precisely, because it is easy to
   overstate.** The six **platform** tarballs are verified against
   `package.platformTarballSha256` in their `ladybug-package-qualification`
   reports, which `release.yml` asserts in CI against the bytes it built and
   which the script fetches **separately** from the `npm-packages` artifact it
   is checking. That is independent. The **root launcher** has no digest from
   lore-cli's own CI, because it is `npm pack`'d inside that same job. What binds
   it is the qualification receipt above. Since LCLI-578, the receipt records a
   sha256 for all seven tarballs, root included, and the script refuses on any
   mismatch. Since LCLI-586, it also re-hashes each tarball immediately before
   that tarball's own `npm publish`, including on `--dry-run`, and refuses if
   the bytes changed after the gate. So the root launcher, which is published up
   to about 30 minutes after the gate, is re-checked against the receipt just
   before its own publish. That narrows the window rather than closing it: npm
   reads the file again milliseconds after the re-hash, and that gap is
   unchecked. Be
   exact about what the receipt's root digest is. opum-cli-e2e re-hashes it from
   this same Release run's `npm-packages` artifact (its `receipts/README.md`:
   "re-hashed at write time from the bound artifacts"). It is recorded by
   another repository, from bytes that repository qualified. It is **not** the
   product of a second, independent build. The script does not use the
   qualification reports' own `rootTarballSha256`: each host packs the root
   itself, and the darwin runners' zlib compresses the identical tar stream to
   different bytes, so that field disagrees by host (LCLI-568).
   `SHA256SUMS.txt` is a local seal: CI does not emit it, the script generates
   it, and it therefore proves only that the download has not changed since
   sealing. Six of seven are verified against a separate artifact of the build,
   and all seven against the receipt; do not round that up to "all seven
   independently verified".

   It publishes platform packages first and stops **before** the root
   launcher if any of them fails — but publish ORDER alone does not make the
   launcher unresolvable-before-its-binary, and used to be described here as if
   it did (LCLI-502). `0.7.0` published in exactly this order and the
   registry's READ API still resolved the root launcher 121 seconds before the
   last platform package, because registry-read visibility is per-package and
   not ordered by publish order; an install inside that window **succeeded
   with the binary silently missing**, since the platform packages are
   `optionalDependencies`. The script now **gates** the root launcher's publish
   behind a registry-visibility poll over all six platform packages plus a
   fixed propagation cushion (20s, for lag measured beyond what the poll itself
   catches), and treats a `npm publish` call whose own output looks like a
   2FA/staged-publish signal as a distinct case rather than an ordinary
   failure — see "REGISTRY GATE BEFORE THE ROOT LAUNCHER" and
   `looks_like_2fa_or_staging()` in the script for the exact mechanism and its
   citations. It is resumable, skipping versions already published, and
   ends with a clean-temp-dir `npx` install smoke. Digest verification runs
   ahead of the auth check, so a rehearsal proves the bytes are right before
   any **npm** credential exists — but note the prerequisite that replaced the
   `gh run download` line: **`gh` must be installed and authenticated** for
   `--dry-run` too, because that is how the artifact and the qualification
   reports are fetched. `--verify-only` is the exception and deliberately so:
   it reads the registry only, with no `gh`, no artifacts and no network beyond
   npm, because the propagation-timeout message tells an operator who has just
   completed the irreversible step to re-check with it.

   **It reports the shape of the credential it is about to use** — length,
   prefix and a whitespace flag, never a value — and refuses one that is not
   shaped like an npm token. On `0.6.2`, attempts 4 and 5 failed with `PUT 404`,
   which reads exactly like a permissions problem; the shape check
   (`length=24 prefix=OTHER`) showed in one second that the stored secret was not
   an npm token at all. It also names which of the three auth paths it is on
   (Keychain, `NPM_TOKEN`, or `~/.npmrc`), because a `~/.npmrc` web-login session
   reinstates the very 2FA-on-write prompt the Keychain path exists to avoid.

   **A manual publish produces no provenance attestation.** That is a known
   consequence of the broken OIDC path, not a mistake in the script — see
   [Provenance and attestations](#provenance-and-attestations) for what to
   record and what to tell a consumer who notices.

   **Prefer trusted publishing (OIDC) over any token — the token path is now a
   maintenance liability by construction.** npm disabled classic token creation
   in November 2025 and **permanently revoked every existing classic token on
   9 December 2025**; granular access tokens, the only remaining type, are
   capped at 90 days, require 2FA, and must be created on the website. So a
   token-based release stops working inside a quarter, every quarter, and the
   failure surfaces as a stalled release rather than a warning. That is not a
   hypothetical: two granular tokens were rejected outright on 2026-08-29,
   401 on `npm whoami` even in an isolated config, and the 0.3.5 publish stalled.

   `.github/workflows/release.yml` **already contains the whole OIDC path** — a
   `publish (npm, OIDC trusted publishing)` job with `id-token: write` scoped to
   that job alone, `environment: release`, and an explicit npm upgrade to clear
   the `>= 11.5.1` floor. What is missing is the npmjs.com side. Configure it
   once per package at `https://www.npmjs.com/package/<name>/access` — **not**
   the general settings page:

   | field | value |
   |---|---|
   | Organization | `opum-ai` |
   | Repository | `lore-cli` |
   | Workflow filename | `release.yml` (filename only, not a path) |
   | Environment | `release` |
   | Allowed actions | `npm publish` |

   All seven package names need it separately — the launcher and its six
   platform packages are separate packages with separate settings. Every field
   is case-sensitive, and **npm does not validate the configuration when you
   save it**, so a typo surfaces only as a failed publish. A brand-new package
   must be bootstrapped with one manual publish before a trusted publisher can
   be attached to it, which is the same constraint the `0.1.0` first-release
   exception above describes.

   **The `publish: true` prohibition was lifted by owner decision on 2026-08-29**
   (recorded on LCLI-278). Trusted publishing fixes *authentication*, not
   *approval*, and for 2026-08-29 through 2026-09-13 that left a real gap: the
   `release` environment had no protection rules, so a dispatch had no
   second-party approval. That exposure was weighed and accepted, because the
   alternative was not a safer publish but a publish that keeps failing — a
   credential that expires inside a quarter and strands the release when it does.

   **That gap is now closed.** Verified 2026-09-13 against
   `gh api repos/opum-ai/lore-cli/environments/release`: `protection_rules`
   carries a `required_reviewers` rule (id `65483841`, reviewer
   `jeremy-newhouse`, `prevent_self_review: false`), so a `publish: true`
   dispatch pauses for a human approval before the `publish` job deploys. The
   earlier HTTP 422 that blocked this — GitHub refusing required reviewers on
   the then-current billing plan — no longer applies: the repository is public
   as of the 2026-09-10 recreation, and Environment protection rules are
   available to public repositories. Note the environment's `updated_at` still
   reads `2026-09-10T22:39:12Z`; **GitHub does not bump it when a protection
   rule is added**, so that field is not evidence of when the rule appeared and
   must not be used to date it. quest-cli's `release` environment gained the
   adjacent rule id `65483904` in the same window.

   Two caveats keep this short of airtight. `can_admins_bypass` is still `true`,
   so a repository admin can approve their own deployment. And the rule only
   binds if every package's npm Trusted Publisher config sets the **Environment**
   field to `release` (see the field table above) — without that claim, a forged
   `release.yml` with the `environment:` line deleted mints a token npm still
   accepts. Re-verify the API output above before relying on this control rather
   than trusting this paragraph, which is a dated observation and not a live one.

   Once trusted publishing is configured, staging a release is one dispatch:

   ```
   gh workflow run release.yml --ref v<version> -f publish=true
   ```

   The `version-parity` job runs the gate on every dispatch, and `publish`
   needs it. The `publish` job runs the same gate again before its first
   `npm publish`. It uses a sparse checkout of `package.json` and the checker
   only, with no persisted credential. It publishes under `--tag release-candidate`,
   exactly like the script. `test/release-workflow.test.ts` pins both.

   **If you must use a token anyway: a granular access token, not `npm login`.** A web login
   is still subject to "require 2FA for writes", so every publish and every
   dist-tag move prompts for a one-time password — that is the EOTP wall that
   blocked the `0.3.4` release. Granular access tokens (and classic *Automation*
   tokens) bypass 2FA by design, which is what makes an unattended release
   possible. Create one at <https://www.npmjs.com/settings/~/tokens> scoped to
   the `@opum-ai/lore*` packages with read-and-write permission, then store it
   once in the macOS Keychain:

   ```
   security add-generic-password -U -s npm-opum-ai-publish -a "$USER" -w
   ```

   The script reads it from there (falling back to `NPM_TOKEN`, then `~/.npmrc`),
   never echoes it, and passes it through a temporary config rather than
   rewriting `~/.npmrc`. A `401` from `npm whoami` means the stored token has
   expired or been revoked; re-issue it rather than reaching for `npm login`.
6. Verify every `name@version` in the registry and use a new temporary
   directory for a clean `npx @opum-ai/lore@<version> --version` install/run.
   Confirm that `release-candidate` names `<version>` on all seven packages and
   that `latest` is unchanged (`npm view <pkg> dist-tags --json`).
   Record the artifact run, registry, and clean-install evidence in the
   release-truth record. Later versions may use `publish: true` only after
   LCLI-278 is Done; until then, OIDC publication remains prohibited despite
   the valid npm trust relationships.
7. **Move `latest`, after the pair receipt and after quest (LCLI-613, LCLI-621).**
   Wait for opum-cli-e2e to land `receipts/pair/<version>.json` on its `main`,
   and for opum-agent's go, which comes after quest-cli has moved `latest`
   (quest first, then lore). Then, naming the Release run whose `npm-packages`
   artifact was staged:

   ```
   node scripts/promote-latest.mjs --record <file> --version <version> --release-run <run-id> --dry-run
   node scripts/promote-latest.mjs --record <file> --version <version> --release-run <run-id> --promote
   ```

   **The six platform packages move by dist-tag. The launcher is published
   (constitution Article 3 clause 5 as amended by ODOC-302).** `@opum-ai/lore`
   reaches `latest` by a fresh `npm publish <X tarball> --tag latest` of the
   `X` launcher carried in that run's artifact, never by a dist-tag move,
   because only a publish onto `latest` makes npm fill the package-level
   `readme` (OPAG-474). That publish is the only `npm publish` in this
   repository without `--tag release-candidate`, and
   `test/release-workflow.test.ts` holds it to that one site. It is
   quest-cli's promote clause (QCLI-399, `scripts/promote-release.mjs` at
   `e3c59d7b`), adopted. Steps 5 to 7 are opum-cli-e2e's `receipts/README.md`
   "What a reader must do" (at `4f078e6b`, TASK-126).

   **An OIDC `publish: true` Release run can be promoted (LCLI-616).** Step 1
   below requires the run to have concluded `success`. Until LCLI-616 every
   `publish: true` run concluded `failure`: the `publish` job's last step ran
   `bash scripts/readme-readback.sh`, which its sparse checkout did not carry.
   That step is gone, because a staged `X-rc.N` never sets the package-level
   `readme`, and the read-back now runs here, after the final publish.
   `test/release-workflow.test.ts` pins that every `scripts/` file a
   `release.yml` job runs is in that job's own checkout.

   Before anything moves, dry run included, it checks each of these in order
   and refuses on the first that fails:

   1. **The tag and the run.** `v<version>` peels to a commit, and
      `--release-run` is a successful `workflow_dispatch` run of `release.yml`,
      built from `opum-ai/lore-cli` at exactly that commit.
   2. **The artifact.** It downloads `npm-packages` afresh into a private
      directory. It must hold exactly eight tarballs: six platforms at `X`,
      one launcher at `X-rc.N` (`N` is read from its name) and the launcher at
      `X`. The two launchers must pass `scripts/launcher-equivalence.mjs`.
   3. **The pass-1 receipt.** `receipts/lore/<version>.json` is read again,
      with the staging gate's rules, so its `tarballs` hold exactly the seven
      staged packages and never the `X` launcher. It adds three more checks.
      Its `commit` must be what the tag peels to. Its `launcherVersion` must be the artifact's `X-rc.N`,
      in the form `^<X>-rc\.[1-9][0-9]*$`. Its `launcherSubstitution` must be
      `MATCH` with no mismatches, and no override waives that. Its
      `finalTarball` must name the basename `opum-ai-lore-<X>.tgz` at the
      artifact `X` launcher's sha256. A receipt without `launcherVersion`
      predates the amendment and refuses, as quest-cli's reader refuses it.
   4. **Staging.** `release-candidate` reads `X` on the six platforms and
      `X-rc.N` on the launcher. Every package's prior `latest`, the
      launcher's included, goes into the record. On a fresh run (no record
      yet) it refuses if any package's current `latest` is newer than `X`,
      compared numerically, or is not a plain `X.Y.Z`, naming the package
      (LCLI-631). A backport is not a promote use case. A non-plain `X` never
      gets this far, because item 2's equivalence check refuses it. A resumed
      run compares each package's current `latest` with `X` too, and refuses
      when one is strictly newer, naming the package and both versions
      (LCLI-638): the record carries the FIRST run's prior values, so a
      registry that moved ahead in between would otherwise make the resume
      move `latest` backwards. The comparison is by the release a live value
      leads with, so `5.7.0-rc.1` is newer than `5.6.7` and refuses, while
      `5.6.7-rc.1` or `5.6.7+build.7` is not newer than `5.6.7` and still
      resumes. A package already at `X`, or below it, still resumes.
   5. **The pair receipt.** It must pass every step of "What a reader must
      do":
      - `kind` is `opum.pair-qualification-receipt.v1`.
      - `verdict` is `QUALIFIED`, or a complete override is present (`by`,
        `reason`, `task`, `adr`), which is printed verbatim.
      - `pair.lore.version` and `pair.quest.version` are both `<version>`, and
        `pair.lore.commit` is the commit `v<version>` peels to on lore-cli.
      - `pair.lore.tarballs` names exactly the seven staged archives, and each
        `distIntegrity` is what npm serves for that package now.
      - `pair.lore.launcherVersion` is the artifact's `X-rc.N`, and the
        launcher entry is keyed and read at it, not at `X`.
   6. **Quest first.** `@opum-ai/quest`'s `latest` already reads `<version>`.
   7. **Step 6.** `npm pack @opum-ai/lore@<X-rc.N>` from the registry must be
      sha256-identical to the artifact's rc. The `X` launcher must be
      equivalent to that served rc, and must still hash to the pass-1
      receipt's `finalTarball.sha256`.
   8. **`X` not already taken.** If `@opum-ai/lore@<version>` is already on
      npm, its `dist.integrity` must be the artifact `X` launcher's. That is a
      resume, and the launcher's tag moves instead of republishing. Other
      bytes refuse: npm versions are immutable, so that needs a new version.
      A registry read that fails with anything but npm's not-found also
      refuses.
   9. **The GitHub Release can be cut (LCLI-622, LCLI-639).** `CHANGELOG.md`
      **at the commit `v<version>` peels to** -- step 1 already resolved that
      commit -- must have a non-empty `## [<version>]` section: the release's
      notes are that section, trimmed, heading excluded, and they are read
      from that commit, never from this checkout, with
      `gh api --hostname github.com -H "Accept: application/vnd.github.raw" repos/opum-ai/lore-cli/contents/CHANGELOG.md?ref=<that commit>`.
      So an uncommitted edit, or a section edited after the tag, cannot become
      the body of a new release, and the read is addressed by the commit
      rather than by the tag ref, because a tag ref can be re-pointed. A
      commit whose `CHANGELOG.md` cannot be read, or carries no such section,
      refuses: the tag is immutable, so neither is fixable in this checkout --
      re-point `v<version>` at a commit whose `CHANGELOG.md` carries the
      section, or cut that release by hand with notes you choose. Then
      `scripts/github-release.mjs` reads `v<version>` with
      `gh release view v<version> -R github.com/opum-ai/lore-cli --json tagName,body,isDraft,isPrerelease`,
      writing nothing. It refuses when gh cannot read the repository (not
      installed, logged out, offline, no access). It also refuses when
      `v<version>` already exists as a draft or a prerelease, or with notes
      that differ from the section. Notes are compared after CRLF becomes LF
      and outer whitespace is trimmed, on both sides. An existing release is
      never edited: publishing a draft or rewriting published notes is a
      decision for a person, so reconcile it by hand and re-run. This check
      reads, so it proves gh can see the repository, not that its token may
      create a release. A token that cannot is found only at the cut, after
      `latest` has moved, and is reported there.

   The receipts are read with the host, repository and ref pinned. A 403 or
   404 means no receipt, and it refuses. `--version` must be strict semver.

   `--promote` then writes every prior `latest` to `<file>` **before** anything
   moves. It moves the six platforms with `npm dist-tag add`. It runs step 6
   again, and then publishes the `X` launcher with `--tag latest`, last. If a
   platform move or the launcher publish fails, it restores every tag that run
   moved, the launcher's `latest` included, by dist-tag. After a successful
   run it runs step 7. It re-reads `latest` on all seven packages until each
   reads `<version>`. It also checks that npm serves `@opum-ai/lore@<version>`
   with the artifact `X` launcher's `dist.integrity`.

   **Then it cuts the GitHub Release (LCLI-622, paired with quest-cli QCLI-398
   and QCLI-401).** It first deletes the private npmrc that held the npm token,
   so gh never runs while the token is on disk. If `v<version>` does not exist,
   it creates it with `gh release create v<version> -R github.com/opum-ai/lore-cli
   --verify-tag --title "Lore CLI <version>" --notes-file <the section> --latest=true`.
   The result is a non-draft, non-prerelease release marked latest, and
   `--verify-tag` means it never creates a tag. If `v<version>` already
   exists, published and with the same notes, it only marks it latest
   (`gh release edit v<version> -R github.com/opum-ai/lore-cli --latest`), and never recreates or re-notes it.
   A failure here does not undo anything. Promote prints `!!! THE GITHUB
   RELEASE FOR v<version> WAS NOT CUT ... !!!` with gh's reason, still runs
   the README read-back, and exits `3`. Fix the cause, then cut it by hand
   with the same code path:

   ```
   node scripts/github-release.mjs --version <version>            # read and report only
   node scripts/github-release.mjs --version <version> --create   # cut it, marked latest
   ```

   That command resolves the tag first and reads the same bytes the preflight
   did -- `CHANGELOG.md` at the commit `v<version>` peels to -- so a promotion
   that refused at step 9 for want of that section refuses here too, and with
   the same reason. It exits `0` when done, `1` when it refuses or fails, and
   `2` on bad arguments. `--not-latest` cuts a backfill without marking it
   latest.

   **Then it reads the README back, and asserts it (OPAG-474 AC3, LCLI-616).**
   It runs `scripts/readme-readback.sh` with its working directory set to a
   private directory holding the `X` tarball's own `package/package.json` and
   `package/README.md`, so "byte-equal" means equal to the bytes that shipped.
   The npm registry pins travel in its environment, and every npm config
   variable the caller had, in either case, is dropped first. `REGISTRY_WINDOW_SECONDS`
   passes through, and promote validates it before step 1 (and in a `--dry-run`):
   anything other than a whole number of seconds (`0`, or up to nine digits with
   no leading zero; unset or empty means 1800) exits `2` before anything is read,
   moved or published (LCLI-626). Its output prints when it finishes. A `--dry-run` never runs
   it. Promote classifies the result by the script's `A4 VERDICT:` line, never
   by its last line of output, as one of three states:

   - **PASSED**: the verdict line says `PASSED` and the script exited `0`.
     Promote exits `0`.
   - **NOT CONFIRMED**: nothing was proven either way. That covers the
     previous release's README still served, an empty `readme` on a packument
     that does not list `<version>` yet, and a checker that could not read its
     input. It also covers a tooling failure: no verdict line at all, because
     the temp directory, the extraction or the script itself failed. A tooling
     failure is labelled as one, never as OPAG-474. Promote exits `3`.
   - **DID NOT PASS**: a finding about the page. Either an empty `readme` on a
     packument that already lists `<version>` (OPAG-474), or a page that
     matches no release. Promote exits `3`.

   **Exit `3` means the promotion is complete, and a post-latest step did not
   complete:** the readme is not established, or the GitHub Release was not
   cut (LCLI-622), or both. The messages and checklist item 2 say which. Exit
   `3` is used for nothing else. By then `latest` reads
   `<version>` on all seven packages and step 7 has verified npm's `X` bytes,
   so nothing is rolled back and nothing more is written. **Do not run
   `--rollback`**: the page is immutable, and restoring the old `latest` undoes
   a correct release without giving the page a readme. For DID NOT PASS the fix
   is the next release. For NOT CONFIRMED, re-read once propagation is plainly
   done. Either way, re-read it by hand (`npm view @opum-ai/lore readme | wc -c`)
   and record the result in the release-truth record. The message also prints
   the command that re-runs the whole read-back against the served tarball.
   NOT CONFIRMED exits `3` rather than `0` because both states leave the readme
   unproven, and the operator's remedy is the same; the printed label says
   which it was. A non-zero exit here replaces LCLI-621's warn-only read-back.
   That design warned rather than failed because a failure "invites the wrong
   remedy". The distinct code and the explicit do-not-roll-back message answer
   that concern without letting a pipeline exit `0` over an unproven readme.

   **The commit comes from the tag, not from npm, and that is the one
   place this cannot mirror quest.** quest checks npm's recorded `gitHead`.
   npm records **no** `gitHead` for any `@opum-ai/lore` package, because a
   tarball-file publish carries none. Measured 2026-09-26 on 0.9.3 and 0.9.2,
   root and platform. The `v<version>` tag is the derivation opum-cli-e2e's own
   receipt contract uses for a lore commit. If npm ever does record a `gitHead`,
   it must agree as well.

   **The tag is peeled all the way, explicitly.** opum-agent accepted this design
   on 2026-09-27 with that condition. lore's release tags are annotated:
   `refs/tags/v0.9.3` names a tag object (`c07b0ea4`), and that tag object names
   the commit (`819a682c`). A receipt compared with the ref's own sha would never
   match. So the script reads the exact ref, follows each tag object until it
   reaches a commit (nested tags included, up to eight deep), and compares that
   commit. It refuses when the tag is missing, when the chain ends on a tree or
   a blob, when the API answers for a different ref, and when the chain is too
   deep or cycles. It never falls back to a branch head.

   `--rollback <file>` restores all seven later, the launcher's `latest`
   included, for instance if quest's side must be undone. It needs no Release
   run, and it is deliberately not gated on either receipt. Keep `<file>`: a
   rerun reuses it rather than re-reading `latest`, because after a partial
   move the registry's `latest` is the new version. Registry publication is
   irreversible, so what rolls back is the dist-tags. A published `X` stays
   published and a rerun at the same version finds it. Never unpublish, and
   never skip a failed side to a different number (clause 5). `--dry-run`
   reads everything, runs step 6 once, prints the record it would write, each
   move and the GitHub Release it would cut, and changes nothing.
8. **After `latest` moves: the post-latest checklist (LCLI-618).**
   `scripts/promote-latest.mjs --promote` prints this list when it finishes,
   whether or not the README read-back passed, because the promotion is
   complete either way. It cites this item, and `test/promote-latest.test.ts`
   holds the two to the same five steps. `scripts/publish-release.sh` used to
   print these after staging. By then npm had not written the package-level
   `readme` and `latest` had not moved, so its closing checklist now stops at
   the promotion.

   1. **README read-back.** It has already run (item 7). The checklist labels
      it PASSED, NOT CONFIRMED or DID NOT PASS, and repeats the script's
      `A4 VERDICT:` line. Record that line in the release-truth record. If it
      is not PASSED, re-read it by hand, and do not roll back.
   2. **GitHub Release.** It has already run (item 7, LCLI-622): promote cut
      `v<version>` from `CHANGELOG.md`'s `[<version>]` section at the commit
      `v<version>` peels to, or marked an existing identical one latest. The
      checklist says DONE or NOT CUT and repeats the outcome. Nothing is asked
      of you when it is DONE. If it is NOT CUT, do not roll back. Fix the
      cause, then cut it by hand with
      `node scripts/github-release.mjs --version <version> --create`, and
      record in the release-truth record that you did. If the cause is the
      tagged commit's own `CHANGELOG.md` -- a missing or empty section there --
      that command refuses too, and rightly: both read the same bytes. Re-point
      `v<version>` at a commit whose `CHANGELOG.md` carries the section, or cut
      the release by hand with `gh release create` and notes you choose;
      neither is something this tooling does for you.
   3. **Tell quest-cli that lore is live on `latest`.** Tell opum-cli-e2e the
      same, for information, and opum-agent, whose go it was. Resolve each
      session with `ListAgents` and match on repository.
   4. **The LCLI-469 marketplace handshake, second message.**
      `opum-marketplace` holds its `opum-lore` pin until `dist-tags.latest`
      moves, and clause 4 has it bump `opum-lore` and `opum-quest` together.
      Tell it `latest` has moved. Send the tag name, tag object SHA, peeled
      commit and `skills/` tree SHA from item 4 again, to be re-resolved rather
      than trusted. The checklist prints all four, resolved: the tag chain the
      promotion peeled, and the `skills/` tree read through the same `gh api`
      chain (the commit, its root tree, the tree's `skills` entry). If that
      read fails it says NOT RESOLVED and gives the command to resolve it by
      hand.
   5. **The release-truth record.** Update
      `docs/reference/lore-cli-release-truth.md`: replace its current-state
      claim so it says `<version>` is released. Record the Release run, the
      promotion record, the read-back verdict, and how the release was staged.
      A staging by `scripts/publish-release.sh` carries no provenance
      attestation; say so rather than let a reader infer it from an earlier
      version.

### 4. RC dist-tag publication (release-candidate, non-promoting)

This procedure publishes a qualified release **candidate** to npm under the
`release-candidate` dist-tag. It predates LCLI-613 and exists because the step-3
flow then ended in a stable `latest` publication. It requires `main`
promotion plus a Release workflow run, which are controls that belong to
calling a version *released*. Since LCLI-613, step 3 itself stages under
`release-candidate` and moves `latest` only in its item 7. This section remains
the manual path for a candidate family outside a Release run. An
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

## Provenance and attestations

Two questions about published provenance will reach you as a consumer report
long before they reach you as a release step. Both have settled answers, and
neither is a compromise. Answer from this section rather than re-deriving it
mid-incident.

### Pre-`0.6.1` provenance links are permanently dangling — expected, not tampering

Every `@opum-ai/lore*` version published before `0.6.1` carries an SLSA
provenance attestation naming a git commit **that no longer exists**. The
repository was deleted and recreated on 2026-09-10 (fleet task OPAG-70),
destroying the old history. The attestations were already published and are
immutable, so they still point into it. On npmjs.com this surfaces as a
provenance link that cannot find its commit — which reads as *tampering* to
anyone who does not know the history was rebuilt.

Retrieving an attestation is non-obvious, so here is the whole path. The
registry returns two attestations per version — npm's own publish attestation
and the SLSA provenance — so select the provenance one by `predicateType`,
base64-decode the sigstore bundle's DSSE payload, and read the commit it
resolved and the ref it built:

```sh
curl -s "https://registry.npmjs.org/-/npm/v1/attestations/@opum-ai%2flore-darwin-arm64@0.6.0" \
  | jq -r '.attestations[]
           | select(.predicateType == "https://slsa.dev/provenance/v1")
           | .bundle.dsseEnvelope.payload' \
  | base64 -d \
  | jq -r '.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit,
           .predicate.buildDefinition.externalParameters.workflow.ref'
```

Verified 2026-09-13, that prints
`59ba30e497f8e98aa6c6be022d9363fd718fb4ee` and `refs/tags/v0.6.0`. Both ends
of it are gone from GitHub, and the build run the attestation names
(`34393976910`) is gone for the same reason:

```
gh api repos/opum-ai/lore-cli/commits/59ba30e497f8e98aa6c6be022d9363fd718fb4ee
  → HTTP 422  "No commit found for SHA: 59ba30e497f8e98aa6c6be022d9363fd718fb4ee"
gh api repos/opum-ai/lore-cli/actions/runs/34393976910
  → HTTP 404  "Not Found"
```

**This is not repaired, and will not be.** Three constraints, in the order
they close off the options:

1. **npm forbids republishing a version.** A version's metadata, including its
   attestations, is immutable once published. There is no edit.
2. **Re-pointing a tag does not help.** Pushing `v0.6.0` at a commit in the
   new history makes the tag resolve again, but the attestation still names
   `59ba30e4…`, and that SHA still does not exist. The published metadata and
   the repository would disagree — which is a *worse* signal than a clean
   404, because it looks like a tag was moved to cover something up.
3. **Nothing is actually wrong with the artifacts.** The tarballs, their
   SHA-256 checksums, and their signatures are all intact and correctly
   signed; every digest in
   [Lore CLI release truth](../reference/lore-cli-release-truth.md) still
   verifies against what the registry serves. Only the commit the provenance
   *names* stopped existing. The cure is worse than the condition.

So the answer to a consumer is: the dangling link is expected, the artifacts
are the thing to verify, and the release-truth record carries the digests to
verify them against.

### Never check a destroyed SHA in a local clone — `git cat-file` will wrongly pass it

**A local clone still has the destroyed commits as loose objects, so
`git cat-file` reports them perfectly healthy.** Run
`git cat-file -p 59ba30e497f8e98aa6c6be022d9363fd718fb4ee` in any checkout
that existed before 2026-09-10 — including this repository's own working
checkout — and you get a full commit object back, tree, parent, signature and
all. That is a false pass on exactly the artifacts the warning above is
about: the objects survive locally because nothing ever deleted them from your
object store, while the remote they claim to live in was destroyed and rebuilt.

**The live GitHub API is the only valid check.** `gh api
repos/opum-ai/lore-cli/commits/<sha>` answering 422 is the ground truth; a
local `git cat-file`, `git show`, or `git log` result proves nothing about
whether the commit a published attestation points at is reachable by anyone
else in the world. Never close a provenance question on local evidence.

### `0.6.1` and `0.6.2` ship with NO attestation at all

This is a separate fact from the dangling links above, and consumers file it
as a defect if it is not stated plainly: **`0.6.1` carries no provenance
attestation, and `0.6.2` will not either.**

The cause is not the repository recreation — it is that OIDC trusted
publishing is broken for this repository (**LCLI-482, open and unresolved**).
GitHub issues immutable-format OIDC subject claims
(`repo:opum-ai@<repo-id>/lore-cli@<id>:…`) that npm's Trusted Publishing does
not match, so npm treats the minted token as unauthenticated and the publish
job fails. Releases therefore go out through the manual
`scripts/publish-release.sh` path in [Step 3](#3-cut-a-release), and **a
manual publish cannot produce an attestation** — provenance is generated by
the CI OIDC path and by nothing else.

Until LCLI-482 closes, every release published this way is attestation-free.
Do not describe it as fixed, and do not let a reader infer provenance from
`0.6.0`'s having had it. State it in the release notes and in the
release-truth record at publish time; what a consumer verifies instead is the
tarball SHA-256 set. Be precise about that substitute rather than generous with
it: `scripts/publish-release.sh` checks the six platform tarballs against the
digests CI recorded in their qualification reports, which is an independent
check, and the root launcher only against a locally generated `SHA256SUMS.txt`,
which is tamper-evidence on one download and not provenance. A consumer told
"the checksums are verified" will assume more than is true for the seventh.

### The `X` launcher on `latest` is provenance-missing, byte-bound to the qualified rc

Since LCLI-621 the launcher reaches `latest` by a separate publish. A Release
run stages the six platform packages at `X` and the launcher at `X-rc.N`.
The launcher at `X` reaches npm later, when `scripts/promote-latest.mjs`
publishes it with `--tag latest` from the operator's machine. That publish
does not go through CI's OIDC trusted publishing, so it produces no
attestation. This does not depend on LCLI-482: the launcher at `X` would stay
unattested even with trusted publishing fixed. Record it in the release notes
and the release-truth record as **provenance-missing, byte-bound to the
qualified rc**. That is the wording opum-agent ruled on OPAG-127 (AC4).

Two checks tie those bytes to what was tested. The equivalence gate,
`scripts/launcher-equivalence.mjs`, proves the `X` launcher equals the
qualified `X-rc.N` once `X-rc.N` is replaced with `X`. The pass-1 receipt's
`finalTarball.sha256` pins the exact `X` tarball, and `promote-latest.mjs`
re-checks both before it publishes. **They do not substitute for provenance,
and they are not stronger than it.** They answer "are these the same bytes
as the ones tested?" Provenance answers "where were these built, and from
what?": the workflow, the commit and the runner. Neither answer contains the
other. When a consumer asks whether the `X` launcher is attested, the answer
is no. Do not offer the digest as if it were an attestation.

This is not a lore-only gap. opum-agent's ruling on LCLI-625 (2026-09-27)
reports that OPAG-127 read the packuments of quest 0.10.0 and 0.11.0, lore
0.11.0, and both CLIs' `darwin-arm64` platform packages at 0.11.0, and found
no attestations key on any of them. That was relayed to this repository, not
re-measured here. The fix is to move the
final publish into a CI job that holds `id-token: write`. It belongs to
opum-agent's **OPAG-127**, for **both** CLIs: constitution Article 3.5
requires lore and quest to promote the same way (quest-cli's mirror is
QCLI-399). Do not file it as a lore-only task, and do not move lore's final
publish into CI on its own.

**What `provenance-post` checks (LCLI-625).** `release.yml`'s
`provenance-post` job runs `scripts/release-provenance.mjs --post
--launcher-rc N --publish-result R`. `N` comes from this dispatch's
`launcher_rc` input, `R` from `needs.publish.result` (LCLI-635). It checks
what the Release run published: the six platform packages at `X` and the
launcher at `X-rc.N`. It never checks `@opum-ai/lore@X`, which the run did not
publish. The script refuses `--post` without a well-formed `--launcher-rc` or a
`--publish-result` drawn from GitHub's own result vocabulary (exit 2) rather
than guessing `N`, or guessing the cause below. Each run prints, in the log and
the job summary, that the `X` launcher was not checked and why. Before LCLI-625
it checked every package at `X`. On a `publish: true` run that meant asking for
a launcher that did not exist yet, and never checking the rc the run did
publish.

`R` decides which cause a **not-published** finding — a version this release
expected that the registry's read API does not list — leads with. That finding
has two explanations: the publish job stopped partway, or the read API is
lagging a publish that succeeded (LCLI-460). When `R` is `success`, every
package is on the registry — published by this run, or found there with
matching bytes by its own skip check — so the warning leads with the lag and
does **not** prescribe "Re-run failed jobs". Otherwise a partial publish is
the likely cause and the warning says so, while naming the other explanation
and sending the reader to the publish job's log, which is what tells them
apart: `success` is the only result that rules a partial publish out. The same
choice orders the job summary's verdict, and the log names `R` on every run so
the choice can be checked rather than trusted.

**What `provenance-pre` checks (LCLI-627).** `release.yml`'s `provenance-pre`
job runs `scripts/release-provenance.mjs --pre` before `publish`. It
re-verifies provenance already on the registry, one *release* at a time. The
launcher's packument can hold several versions for one release `X`: each
staged `X-rc.N`, then `X` once `promote-latest.mjs` has published it. The
platform packages only ever hold `X`. So `--pre` groups the launcher's
versions by `X` and checks each release this way:

- Each platform package at `X`, once. It never asks for a platform at an
  `X-rc.N` version. This includes a release whose launcher has only rcs,
  because it was staged and not yet promoted, or abandoned.
- The launcher at each version it has, once each.

`X` is the launcher version with only a trailing `-rc.N` removed. `N` follows
the `--launcher-rc` rule: a positive integer with no leading zero. Every
other version is a release of its own, and every package is checked at that
exact version. So `1.0.0-beta.1` is its own release, separate from `1.0.0`,
and `1.0.0-beta.1-rc.1` is one of its rcs. `scripts/publish-release.sh`
accepts any version that starts with a digit, so a prerelease `X` can occur.
A string such as `X-rc.0` does not follow the rule, so it is also its own
release. A version that is not semver-shaped at all is its own release too.
The job warns about it, sorts it after every semver-shaped release, and
checks it at every package.

`--limit` (default 10) counts releases, so three rcs of one release take one
slot. A release at or below the `KNOWN_DANGLING_THROUGH` baseline is listed
with all its rcs and never fetched. That test reads the numbers of `X`, so a
prerelease of the baseline's own version is at or below it. The order is
fixed by the script, not by the registry:

- Releases run oldest first by their numbers. A prerelease `X` comes before
  the bare `X` with the same numbers. Two prereleases with the same numbers
  are compared as plain strings, which is not full semver ordering.
- Within a release the rcs run by numeric `N`, so `rc.2` comes before
  `rc.10`, and `X` comes last.

Before LCLI-627, `--pre` checked all seven packages at every launcher
version. Each rc then asked for six platform versions that cannot exist, and
rcs used up `--limit` slots on their own. The platforms at `X` were not
re-checked until promotion, and never for an abandoned rc.

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

## Held release steps

A contract change that lands in two releases — advisory first, enforced after
every consumer has had one release of notice — is held by a **record**, not by
intent: a Quest task whose schedule names the release it waits for, plus the one
line of production code the flip changes. Read this list when cutting a release;
each item says which release it belongs to.

- **`agent-profile-capacity` flips from warning to error** (LCLI-642 and
  LCLI-662; DEC-11, DEC-98 B). A boundary ships as the **warning** in the release
  that first carries the measurement being enforced, and as the error in the
  release **after** it — not the same one, which would leave external
  repositories no notice at all. Resolve "first carries" off the tag, never off
  the severity constant: `git merge-base --is-ancestor <sha> <tag>` and `git tag
  --contains <sha>` answer which release carries a change, where the constant in
  a tag's tree only says which release has the *old* behaviour. LCLI-642's
  finding shipped in v0.12.0, whose tree carries `= "warning"`; LCLI-662 then
  strengthened the measurement (`0d568f0f`, DEC-98 B), and no tag contained it
  when this was written (2026-10-02 — re-check by ref before cutting), so the
  first release to carry `0d568f0f` is the warning release for the boundary
  actually enforced, and the flip waits for the release after that one. The flip
  is **one line**: `AGENT_PROFILE_CAPACITY_SEVERITY` in `src/core/check.ts`, from
  `"warning"` to `"error"`. LCLI-646 holds it and its criteria require the
  ordering to be read off what was actually published rather than assumed.

## Rollback

- **Before publish**: nothing external happened — delete the tag, fix the
  issue, retry.
- **Bootstrap `0.1.0` failed partway**: do **not** bump the version or rebuild.
  Fix the account/access problem and resume with the same downloaded tarballs;
  skip any exact package versions already present. The root launcher is
  published last, so a platform-package failure leaves nothing installable.
- **A later OIDC publish job failed partway**: do **not** bump the version —
  fix the cause (usually a missing or mistyped Trusted Publisher) and
  resume. Prefer **Re-run failed jobs**, NOT **Re-run all jobs**, on the same
  Release run. Re-run failed jobs reuses that run's `npm-packages` artifact, so
  the packages already on the registry are this run's bytes; the publish step
  skips those and completes the rest. Re-run all jobs re-runs `package`, which
  overwrites `npm-packages` with a rebuild. GitHub only allows a re-run within
  30 days of the original run, and the artifact expires under its retention
  (`npm-packages` sets no `retention-days`, so the repository default applies).
  If the registry's platforms were staged by `scripts/publish-release.sh` from
  a `publish: false` run, that run has no failed publish job to re-run: run
  `scripts/publish-release.sh X <that run id>` instead. A fresh dispatch on the
  same commit rebuilds the tarballs, and the publish step refuses any package
  already on the registry with other bytes rather than skipping it.
  The launcher (`@opum-ai/lore`) is published last precisely so a
  partial failure leaves nothing installable and the same version stays
  retryable. If the launcher itself published and something is still wrong,
  you cannot republish that version — cut `X.Y.Z+1` and `npm deprecate` the
  bad one (see below).
- **A `latest` move failed or must be undone** (LCLI-613, LCLI-621): nothing
  is unpublished. `scripts/promote-latest.mjs` has already restored every tag
  its own failed run moved, including the package whose write failed, since a
  timed-out write may still have landed. That includes the launcher, whose
  `X` reaches `latest` by a publish: its `latest` is restored to the recorded
  prior value by dist-tag, and the published `X` stays on the registry. To
  restore all seven from the record, the launcher's `latest` included, run
  `node scripts/promote-latest.mjs --rollback <file>`. It is idempotent and
  not gated on the pair receipt. It refuses a record whose prior values are
  not plain `X.Y.Z` releases or equal the record's own release. It first reads
  every package's dist-tags anonymously, and it refuses if any `latest` reads
  anything other than the record's release or its prior value, or cannot be
  read, so an old record cannot silently downgrade a later release. These are
  quest-cli's rules exactly (QCLI-390, opum-ai/quest-cli#316). Then retry at
  the **same** version (Article 3 clause 5).

  **`--rollback` does not touch the GitHub Release.** A promotion that got as
  far as the cut leaves `v<version>` on GitHub, marked latest, after its npm
  `latest` has been rolled back. Delete nothing. Mark the prior release
  latest again by hand:
  `gh release edit v<prior> -R github.com/opum-ai/lore-cli --latest`. When the
  same version is promoted again, promote finds `v<version>` with the same
  notes and only marks it latest.

  Quest moves first, so the pair goes out of step when **lore's** move fails
  after quest's `latest` has already moved. Retry lore at the same version.
  If the pair has to go back instead, roll lore back from its record (a no-op
  if nothing moved), then have quest-cli roll quest back from its own record,
  so the two `latest` values end up agreeing.
- **After a bad publish**: npm allows `npm unpublish` only within 72 hours and
  only if no other package depends on the version; prefer publishing a patched
  version and deprecating the bad one (`npm deprecate @opum-ai/lore@X.Y.Z
  "broken release, use X.Y.Z+1"`) over unpublishing, which can break anyone who
  already installed it.
