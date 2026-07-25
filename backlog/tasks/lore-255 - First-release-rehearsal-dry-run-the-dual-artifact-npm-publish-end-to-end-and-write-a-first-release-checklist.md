---
id: LORE-255
title: >-
  First-release rehearsal: dry-run the dual-artifact npm publish end-to-end and
  write a first-release checklist
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 18:41'
updated_date: '2026-07-25 04:09'
labels:
  - build-ci-config
  - release
dependencies: []
references:
  - .github/workflows/release.yml
  - docs/runbooks/release-publishing.md
priority: medium
type: task
ordinal: 357000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
De-risk lore's first real npm publish by rehearsing the dual-artifact (launcher meta-package + 5 platform binary packages) publish path end-to-end and capturing a first-release checklist, so the actual cut is mechanical.

## Why it matters
release.yml is a well-engineered DRY-RUN only: it compiles all 5 platform binaries, packs all 6 packages, enforces version lockstep (verify-versions), and install-sanity-checks the launcher — but the actual npm publish leg is an unimplemented TODO and has NEVER been executed or dry-run'd. package.json is still version 0.0.0 across all six manifests. The one step that matters is untested, and several off-repo/manual prerequisites are easy to forget.

## Context
release.yml, docs/runbooks/release-publishing.md, bin/lore.cjs, package.json optionalDependencies pins. The real publish is additionally gated on LORE-253 + the upstream tag; this rehearsal + checklist are actionable now.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An 'npm publish --dry-run' of all 6 packages (root launcher + 5 platform) runs and its output is verified (correct files, os/cpu, bin, version).
- [x] #2 A first-release checklist is documented in release-publishing.md covering: the coordinated 0.0.0->real version bump across all 6 manifests + the 5 optionalDependencies pins (what verify-versions enforces); flipping package.json bin.lore from src/cli.ts to bin/lore.cjs; the tag/CHANGELOG flow; npm OIDC trusted-publisher registration for all 6 packages; the publish job's id-token:write permission; and a post-publish smoke install of the launcher.
- [x] #3 The currently-TODO publish job is either implemented (dispatch/tag-gated, with id-token:write and trusted publishing) or the checklist specifies exactly what remains to wire it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rehearse the dry-run publish end-to-end, reproducing release.yml's build+package
   jobs locally inside this worktree (never crossing filesystem boundary, per the
   verified EXDEV trap):
   - `bun build --compile --target=<t> --outfile=npm/<platform>/bin/<binary> src/cli.ts`
     for all 5 platform targets (darwin-arm64, darwin-x64, linux-arm64, linux-x64,
     win32-x64). Size-check each (>1MB, non-EXDEV-trap) and natively execute the
     darwin-arm64 one (matches this host) to confirm --version == package.json version.
   - Root package: patch a SCRATCH copy of package.json (bin.lore -> bin/lore.cjs,
     same technique the `package` job uses), `npm publish --dry-run`, `git checkout --
     package.json` to revert.
   - Each of the 5 npm/<platform>/ dirs: `npm publish --dry-run`, inspect tarball
     contents/os/cpu/bin/version in the output.
   - Full pack + install-sanity smoke: `npm pack` all 6 into dist-npm/, install the
     root + darwin-arm64 tarballs into a scratch project (inside the worktree, not
     /tmp), run the installed `lore` bin via node_modules/.bin, confirm --version and
     --help resolve through the real launcher chain.
   - Capture the evidence (commands + key output) in task notes for AC#1.
   - NEVER real npm publish/login/token/tag/workflow_dispatch — dry-run only.
2. AC#2: add a "First-release checklist" section to docs/runbooks/release-publishing.md
   (checkbox list, cross-linked with the existing narrative Steps) covering exactly the
   six items the AC names: coordinated 0.0.0->real version bump across all 6 manifests +
   the 5 optionalDependencies pins; flipping package.json bin.lore to bin/lore.cjs;
   the tag/CHANGELOG flow (describe here only — do not touch CHANGELOG.md itself, that's
   LORE-264's file); npm OIDC trusted-publisher registration for all 6 packages;
   the publish job's id-token:write permission; a post-publish smoke install of the
   launcher. Drive the edit through `lore` conventions (prose outside managed blocks,
   `lore check`/`lore validate` clean after).
3. AC#3 DECISION (recorded per task's own "decide in plan" latitude): IMPLEMENT the
   dispatch/tag-gated publish job in release.yml rather than only specifying it, because
   (a) it is static YAML — adding it cannot itself trigger a publish: the workflow stays
   workflow_dispatch-only (already true today) and the new job additionally gates on
   `inputs.publish == true`; (b) no npm Trusted Publisher is configured yet on npmjs.com,
   so even a manual dispatch with publish:true would fail loud at the auth step, which is
   the correct "not ready" behavior, not a hazard; (c) it best serves the task's own
   "so the actual cut is mechanical" outcome. Shape: new `publish` job, `needs: [setup,
   package]` (package already needs build+verify-versions, so every existing gate is
   transitively required), `if: ${{ inputs.publish == true }}`, job-level `permissions:
   { contents: read, id-token: write }` (least-privilege, not workflow-level), downloads
   the `npm-packages-dry-run` artifact from `package`, `actions/setup-node` (reuse the
   pin already used in ci.yml) with a node version that ships npm>=11.5.1 + an explicit
   `npm --version` floor assertion (fail loud, matching verify-versions' style),
   registry-url https://registry.npmjs.org, then `npm publish` each of the 6 tarballs
   (OIDC trusted publishing — no NODE_AUTH_TOKEN/secret). Update the workflow's top
   comment, the `publish` input description ("has no effect today" no longer true), and
   remove the trailing TODO block (superseded by the real job). Update runbook Step 2
   to say the job exists instead of "not yet in release.yml".
4. Do not bump any version (all six manifests stay 0.0.0); do not touch CHANGELOG.md
   (LORE-264 owns it); do not run docker e2e (sibling-owned this wave); do not touch
   backlog/docs/ or sibling task files (LORE-256/259/264).
5. Verify: `actionlint .github/workflows/release.yml`, `bun test`, `bun run typecheck`,
   `bun run lint`, `bun run src/cli.ts check`. Clean up all rehearsal scratch output
   (npm/*/bin/, dist-npm/, any scratch install dir) before committing — none of it is
   meant to be tracked (npm/*/bin/ and dist-npm/ are already gitignored).
6. Commit in small logical chunks (docs, workflow) with `Refs: LORE-255` trailers;
   include the backlog/tasks/ status edit; push feature/LORE-255.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## AC#1 — dry-run rehearsal evidence (never a real npm publish/login/tag/dispatch)

Reproduced release.yml's build+package jobs locally inside the worktree (no
cross-device writes):
- Compiled all 5 platform binaries: `bun build --compile --target=<t>
  --outfile=npm/<platform>/bin/<binary> src/cli.ts` for darwin-arm64,
  darwin-x64, linux-arm64, linux-x64, win32-x64. All well above the 1MB
  EXDEV-trap threshold (61MB-120MB). darwin-arm64 (matches this host)
  executed natively: `--version` printed `0.0.0`, matching package.json.
- Root package: patched a SCRATCH copy of package.json (bin.lore ->
  bin/lore.cjs), `npm publish --dry-run` -> correct name/version/files
  (src/, bin/lore.cjs, README.md, LICENSE, package.json, 61 files, public
  access, no auth error), then `git checkout -- package.json` reverted it.
- Each of the 5 npm/<platform>/ dirs: `npm publish --dry-run` -> correct
  name (@salient-data/lore-<platform>), version 0.0.0, 2 files
  (bin/lore[.exe] + package.json), public access, no auth error. os/cpu
  gating already verified structurally via the existing npm/*/package.json
  os/cpu fields (unchanged, correct per platform).
- Full pack + install-sanity: `npm pack` all 6 into dist-npm/, installed
  root + darwin-arm64 tarballs into a scratch project INSIDE the worktree,
  ran `node node_modules/.bin/lore --version`/`--help` -> resolved through
  the real launcher chain (bin/lore.cjs -> require.resolve -> spawnSync),
  version matched package.json.
- Also verified `npm publish --dry-run <tarball-path>` (not just from
  inside the package dir) works identically -- this is what the new
  `publish` job does (publishes the package job's already-packed
  tarballs, no re-pack).
- All rehearsal build output (npm/*/bin/, dist-npm/, scratch install dir)
  deleted before committing; npm/*/bin/ and dist-npm/ are already
  gitignored.

## AC#2 — first-release checklist

Added a "## First-release checklist" section to
docs/runbooks/release-publishing.md (checkbox list, cross-linked to the
detailed Steps below it) covering exactly the 6 items the AC names:
coordinated 0.0.0->real version bump across all 6 manifests + the 5
optionalDependencies pins; the bin.lore flip; the CHANGELOG flow (described
here only -- CHANGELOG.md itself untouched, LORE-264's file); npm OIDC
Trusted Publisher registration for all 6 packages; the publish job's
id-token:write permission; post-publish smoke install. Also added a "Dry-run
rehearsal (verified)" section documenting the AC#1 evidence above for future
maintainers, and updated Step 2 + the workflow-name references now that the
publish job is implemented (see AC#3).

## AC#3 DECISION: implemented the publish job (not just specified)

Rationale (recorded per the task's "decide in plan" latitude): (a) it is
static YAML -- adding it cannot itself trigger a publish; the workflow stays
workflow_dispatch-only (unchanged) and the new job additionally requires
`inputs.publish == true`; (b) no npm Trusted Publisher is configured yet on
npmjs.com, so even a manual publish:true dispatch today would 403 at the
auth step -- the correct "not ready" failure, not a hazard; (c) best serves
the task's own "so the actual cut is mechanical" outcome.

Shape: new `publish` job in release.yml, `needs: [setup, package]` (package
already needs build+verify-versions, so every existing gate is transitively
required), `if: ${{ inputs.publish == true }}`, job-level `permissions: {
contents: read, id-token: write }` (workflow-level permissions stay
`contents: read` only -- no other job can mint an OIDC token). Downloads
the `npm-packages-dry-run` artifact the `package` job already
dry-run-verified (no re-packing), asserts npm >= 11.5.1 (fail loud, mirrors
verify-versions' style), then `npm publish` each of the 6 tarballs via OIDC
trusted publishing (actions/setup-node with registry-url, no
NPM_TOKEN/secret). Renamed the workflow's display name from "Release
(dry-run)" to "Release" (it can now conditionally publish for real) and
updated its top comment / `publish` input description / docs runbook
references accordingly. actionlint clean.

## Regression test

Added test/release-workflow.test.ts (6 tests): parses release.yml with
js-yaml (JSON_SCHEMA, this repo's established YAML-safety idiom) and
asserts the safety-gate invariants that actionlint/typecheck/lint are
silent on -- the workflow triggers only on workflow_dispatch, the publish
input defaults to false, the publish job's `if:` gate is exactly `${{
inputs.publish == true }}`, the needs chain transitively requires
build+verify-versions, id-token:write is scoped to ONLY the publish job
(workflow-level permissions stay contents:read, no other job has
id-token:write), and the publish job uses the real npm registry-url.
Verified the test actually catches a regression: temporarily stripped the
`if:` gate from release.yml, re-ran the suite (1 of 6 failed, exactly the
gate-check test, with a clear "Received: undefined" diagnostic), restored
the real file, re-ran (6/6 pass again).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rehearsed the full dual-artifact npm dry-run publish end-to-end (all 5
platform binaries compiled in-worktree + npm publish --dry-run for all 6
packages + a full pack/install-sanity smoke through the real launcher --
never a real npm publish/login/token/tag/dispatch), documented a
first-release checklist + the rehearsal evidence in
docs/runbooks/release-publishing.md, and implemented release.yml's
dispatch/tag-gated `publish` job (id-token:write scoped to that job only,
OIDC trusted publishing, gated on inputs.publish==true and the full
build/verify-versions/package chain). No version bump (all 6 manifests
stay 0.0.0); CHANGELOG.md untouched (LORE-264's file, described only in
the runbook); docker e2e not run (sibling-owned this wave).

Verified: bun test (2116 pass, 0 fail, including the new
test/release-workflow.test.ts's 6 safety-gate tests -- confirmed one
actually catches a regression by reverting the if: gate and re-running,
then restored); bun run typecheck (clean); bun run lint (biome check,
clean, 0 warnings); bun run src/cli.ts check (39 files, 0 errors, 0
warnings); actionlint .github/workflows/release.yml (clean); bun run
src/cli.ts validate docs/runbooks/release-publishing.md (0 errors, 0
warnings). All 6 npm publish --dry-run runs succeeded with correct
name/version/os/cpu/bin/files and public access, no auth error.
<!-- SECTION:FINAL_SUMMARY:END -->
