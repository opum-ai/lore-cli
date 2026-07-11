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
fires on a push or tag) already **compiles all five platform binaries, assembles
all six packages, and proves the `npx`/launcher resolution mechanism end-to-end**
via `npm pack` + a scratch install + running the launcher (LORE-9). It does
**not** publish anything yet — that step is deliberately not wired (see the
`TODO` at the bottom of the workflow file) until the trusted-publisher setup
below is done once. This runbook is that setup, plus how to cut an actual
release once it's in place.

## Prerequisites

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

### 2. Add the publish job (not yet in `release.yml`)

Once trusted publishing is configured, add a `publish` job to
`.github/workflows/release.yml` (replacing the `TODO` comment at the bottom),
gated on the existing `publish` workflow input, with `permissions: { id-token:
write }` at the job level and `npm publish` (via `actions/setup-node` with
`registry-url: https://registry.npmjs.org`) for the root package and each of
the five `npm/<platform>/` packages, run only after the existing `build` +
`package` jobs (which already prove every artifact is correct) succeed. Bump
every package's `version` (root `package.json` **and** all five
`npm/<platform>/package.json` — they must stay in lockstep) as part of the
same commit/tag that triggers the release.

### 3. Cut a release

1. Bump `version` in `package.json` and all five `npm/<platform>/package.json`
   files to the same new value, in one commit.
2. Tag it (`git tag vX.Y.Z && git push --tags`) — informational only; nothing
   is triggered automatically by the tag.
3. Run the `Release (dry-run)` workflow manually (`workflow_dispatch`) with
   `publish: true` once the publish job from Step 2 exists.
4. Verify: `npx @salient-data/lore@X.Y.Z --version` from a machine that has
   never installed lore before, on at least one platform other than the one
   used to test locally.

## Rollback

- **Before publish**: nothing external happened — delete the tag, fix the
  issue, retry.
- **After a bad publish**: npm allows `npm unpublish` only within 72 hours and
  only if no other package depends on the version; prefer publishing a patched
  version and deprecating the bad one (`npm deprecate @salient-data/lore@X.Y.Z
  "broken release, use X.Y.Z+1"`) over unpublishing, which can break anyone who
  already installed it.
