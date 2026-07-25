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
six packages via npm OIDC Trusted Publishing** (LORE-255). That `publish` job
exists in the workflow already, but it is inert until the one-time
Trusted-Publisher setup below is done on npmjs.com for all six packages — it
will fail loud (auth/403) on any dispatch attempted before then. See
[First-release checklist](#first-release-checklist) below for the exact
mechanical sequence to cut the actual first release; the rest of this runbook
is the supporting detail behind each checklist item.

## First-release checklist

Walk this in order for the actual first release. Every item elaborates on a
`## Steps` section below it — follow the link for the exact commands/fields;
none of the automated checks in `release.yml` (`verify-versions`, `build`,
`package`) substitute for these, since they check *consistency*, not
*absence* (a value that is consistently still `0.0.0`, or a job that never
runs because `publish` stayed `false`, passes every one of them).

- [ ] **npm Trusted Publisher configured for all 6 packages** on npmjs.com —
  [Step 1](#1-configure-npm-trusted-publishing-once-before-the-first-real-publish).
  One-time, must exist before the first publish attempt.
- [ ] **Coordinated version bump: all six manifests + the 5
  `optionalDependencies` pins**, root `0.0.0` → the real release version —
  [Step 3, item 2](#3-cut-a-release). This is exactly the 12 values
  `verify-versions` cross-checks (6 `version` fields + the 5 pins + the
  platform-set itself); a missed file fails loud there before any compile
  work runs, rather than silently skip-installing a platform package later.
- [ ] **Flip `package.json`'s `bin.lore` from `src/cli.ts` to
  `bin/lore.cjs`**, for real, in the same commit as the version bump —
  [Step 3, item 1](#3-cut-a-release). `release.yml`'s `package` job only ever
  patches a *scratch* copy to dry-run-prove the launcher and reverts it — this
  file is deliberately left to a maintainer, not automated.
- [ ] **CHANGELOG.md**: move the `[Unreleased]` section's entries under a new
  `## [X.Y.Z] - YYYY-MM-DD` heading, in the same commit as the version bump,
  so the tag below points at a commit whose CHANGELOG already reflects it.
- [ ] **Commit, tag, push**: `git tag vX.Y.Z && git push --tags` —
  [Step 3, item 3](#3-cut-a-release). Informational only; nothing in this repo
  triggers off the tag automatically.
- [ ] **Dispatch `Release` with `publish: true`** on that tag/commit
  — [Step 3, item 4](#3-cut-a-release). `setup` → `verify-versions` → `build`
  → `package` run exactly as they do on every dispatch (proving every
  artifact again, for this exact commit) before the new `publish` job's
  `id-token: write` step runs.
- [ ] **Post-publish smoke install**: from a machine that has never installed
  lore before, `npx @salient-data/lore@X.Y.Z --version`, on at least one
  platform other than the one used for local development — [Step 3, item
  5](#3-cut-a-release). Confirms the real registry-resolved
  `optionalDependencies` chain, not just the dry-run tarball chain this
  runbook's rehearsal already proved (see [Dry-run rehearsal
  (verified)](#dry-run-rehearsal-verified) below).

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
  scope is personal) — required to configure Trusted Publishers; this is not
  something CI or an agent can do.
- npm CLI **>= 11.5.1** on any machine used for a manual/bootstrap publish
  (trusted publishing itself only requires this on the *publishing* side —
  GitHub's `actions/setup-node` on a fresh runner already satisfies it).
- GitHub-hosted runners only — npm trusted publishing does not support
  self-hosted runners (`release.yml` already uses `ubuntu-latest`).

## Steps

### 1. Configure npm Trusted Publishing (once, before the first real publish)

npm's OIDC-based Trusted Publishing (GA since 2025-07) lets `release.yml`
publish **without a long-lived `NPM_TOKEN` secret** — GitHub's OIDC token
authenticates the publish directly. It works for a brand-new scoped package
that has never been published, not just an existing one: configure the
publisher *before* the first publish attempt and it authenticates that first
publish too. See <https://docs.npmjs.com/trusted-publishers/>.

For **each of the six packages** (`@salient-data/lore` and the five
`@salient-data/lore-<platform>-<arch>` packages), on npmjs.com:

1. Open the package's Settings page → **Trusted Publisher** section.
2. **Select your publisher** → **GitHub Actions**.
3. Fill in (all fields are case-sensitive, exact-match):
   - **Organization or user**: `jeremy-newhouse`
   - **Repository**: `lore`
   - **Workflow filename**: `release.yml` (exactly — the filename this repo's
     workflow already uses, so no rename is needed later)
   - **Allowed actions**: `npm publish`
   - **Environment name**: leave blank unless a GitHub deployment environment
     is added to gate the publish job later (none exists today)
4. Save.

Repeat for all six package names. Validation happens at publish time, not at
save time — a typo here fails silently until the workflow actually tries to
publish.

### 2. The `publish` job (already in `release.yml`)

`release.yml`'s `publish` job publishes all six packages via npm's OIDC-based
Trusted Publishing — `permissions: { id-token: write }` set at the **job**
level (not the workflow level, which stays `contents: read`-only), so only
this one job ever gets the token. It:

- Only runs when a maintainer manually dispatches the workflow with
  `publish: true` (`if: ${{ inputs.publish == true }}`) — the workflow itself
  stays `workflow_dispatch`-only (never fires on push/tag), so this cannot
  fire accidentally.
- `needs: [setup, package]` — `package` already needs `build`, which needs
  `verify-versions`, so every existing consistency/artifact check transitively
  gates it; it never runs against unverified artifacts.
- Downloads the exact `npm-packages` artifact tarballs the `package` job
  already assembled and dry-run-verified (no re-packing, so what gets
  published is byte-identical to what was just proven).
- Uses `actions/setup-node` with `registry-url: https://registry.npmjs.org`,
  upgrades npm (`npm install -g npm@latest`) and then asserts the resolved
  npm CLI meets the `>= 11.5.1` floor (Prerequisites, above) before publishing
  anything — fails loud rather than hitting a confusing OIDC error mid-publish.
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

No further wiring is needed before a real release — see the [First-release
checklist](#first-release-checklist) for what a maintainer still does by hand
(version bump, the `bin.lore` flip, tag, dispatch).

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
3. Tag it (`git tag vX.Y.Z && git push --tags`) — informational only; nothing
   is triggered automatically by the tag.
4. Run the `Release` workflow manually (`workflow_dispatch`) with
   `publish: true`, on the tag/commit from step 3.
5. Verify: `npx @salient-data/lore@X.Y.Z --version` from a machine that has
   never installed lore before, on at least one platform other than the one
   used to test locally.

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
  packages — every one reported the correct package name, version, `os`/
  `cpu` gate, file list (`bin/lore[.exe]` + `package.json` for the platform
  packages; `src/`, `bin/lore.cjs`, `README.md`, `LICENSE`, `package.json`
  for the root), and `access: public` with no auth error (dry-run doesn't
  require registry login).
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
- **Publish job failed partway** (some of the six packages published, some
  not): do **not** bump the version — fix the cause (usually a missing or
  mistyped Trusted Publisher for the package that failed, [Step
  1](#1-configure-npm-trusted-publishing-once-before-the-first-real-publish))
  and re-dispatch `Release` with `publish: true` on the **same commit**; the
  publish step skips packages already on the registry and completes the
  rest. The launcher (`@salient-data/lore`) is published last precisely so a
  partial failure leaves nothing installable and the same version stays
  retryable. If the launcher itself published and something is still wrong,
  you cannot republish that version — cut `X.Y.Z+1` and `npm deprecate` the
  bad one (see below).
- **After a bad publish**: npm allows `npm unpublish` only within 72 hours and
  only if no other package depends on the version; prefer publishing a patched
  version and deprecating the bad one (`npm deprecate @salient-data/lore@X.Y.Z
  "broken release, use X.Y.Z+1"`) over unpublishing, which can break anyone who
  already installed it.
