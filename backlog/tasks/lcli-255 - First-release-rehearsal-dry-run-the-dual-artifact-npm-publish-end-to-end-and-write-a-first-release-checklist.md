---
id: LCLI-255
title: >-
  First-release rehearsal: dry-run the dual-artifact npm publish end-to-end and
  write a first-release checklist
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
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
release.yml, docs/runbooks/release-publishing.md, bin/lore.cjs, package.json optionalDependencies pins. The real publish is additionally gated on LCLI-253 + the upstream tag; this rehearsal + checklist are actionable now.
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
   LCLI-264's file); npm OIDC trusted-publisher registration for all 6 packages;
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
   (LCLI-264 owns it); do not run docker e2e (sibling-owned this wave); do not touch
   backlog/docs/ or sibling task files (LCLI-256/259/264).
5. Verify: `actionlint .github/workflows/release.yml`, `bun test`, `bun run typecheck`,
   `bun run lint`, `bun run src/cli.ts check`. Clean up all rehearsal scratch output
   (npm/*/bin/, dist-npm/, any scratch install dir) before committing — none of it is
   meant to be tracked (npm/*/bin/ and dist-npm/ are already gitignored).
6. Commit in small logical chunks (docs, workflow) with `Refs: LCLI-255` trailers;
   include the backlog/tasks/ status edit; push feature/LCLI-255.
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
here only -- CHANGELOG.md itself untouched, LCLI-264's file); npm OIDC
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

## Review pass 1 fixes (request_changes -> addressed)

[blocking] Publish ordering: the publish job's loop published dist-npm/*.tgz
in filesystem-collation order, which sorts the root launcher tarball BEFORE
its five platform packages (digit sorts before letter) -- inverting the
required publish order for this optionalDependencies-pinned distribution
shape. Rewrote the step to partition dist-npm/*.tgz into 5 platform
tarballs (matched against needs.setup.outputs.namesSpace) + exactly 1 root
tarball (whatever is left), asserting counts (6 total, 5 platform, 1 root)
before publishing anything, then publishes the 5 platform packages first
and the root launcher LAST. Verified the partition/ordering logic against 6
real npm-pack-shaped tarball names in a standalone harness (root correctly
sorted last; count-mismatch correctly fails loud) and mutation-tested the
new regression test by temporarily reverting to the naive
'for tgz in dist-npm/*.tgz' loop -- it failed exactly the new ordering test
(6/7 pass, 1 fail), then restored.

[major] Partial-publish recovery: made the publish loop resumable --
publish_or_skip() extracts each tarball's real name+version (tar -xzOf
.../package.json | node -e ...) and npm view's the registry first, skipping
anything already published, before calling npm publish. Verified against a
mocked npm binary simulating 2-of-6 already published: the script correctly
skipped those 2 and published the remaining 4 in the right order (4
platform-remaining, root last). Added a third Rollback bullet to
release-publishing.md ('Publish job failed partway') describing the
re-dispatch-on-same-commit recovery path and the root-last rationale.

[minor] release-publishing.md Step 3 item 2 now explicitly names updating
root package.json's 5 optionalDependencies pins (the checklist already
named this; the linked detail step didn't).

[minor] Updated tech-stack.md's 'Status (LCLI-9)' paragraph and ADR-0001's
distribution bullet (as an amendment note) to reflect that the publish job
is now implemented (LCLI-255), not a 'publish-free'/'deliberate follow-up'
state.

[nit] Added an 'npm install -g npm@latest' step before the existing
>=11.5.1 floor assertion, so the floor is met rather than merely checked;
added a comment noting the NaN-on-prerelease fail-closed behavior.

[nit] Renamed the upload/download artifact from npm-packages-dry-run to
npm-packages (both the package job's upload and the publish job's
download) since it is no longer accurate -- these tarballs are what gets
published for real in the publish job.

Declined: none of the 6 findings were skipped; all were cheap, verified
fixes to the same publish step + a runbook/docs pass.

Re-verified full set: bun test (2117 pass, 0 fail, including
test/release-workflow.test.ts's new 7th test), bun run typecheck (clean),
bun run lint / biome check (clean), bun run src/cli.ts check (39 files, 0
errors, 0 warnings), actionlint .github/workflows/release.yml (clean). No
version bump (all 6 manifests still 0.0.0); CHANGELOG.md untouched;
backlog/docs/ untouched.

## Review pass 2 fixes (request_changes -> addressed)

[major] Placeholder-version guard: the publish job had no precondition
refusing to publish version 0.0.0 -- every other precondition in the
workflow fails loud (npm floor assertion, the 6/5+1-tarball count asserts,
verify-versions' 12-value cross-check) but this one, the only irreversible
action in the repo, did not, and the First-release checklist deliberately
orders Trusted Publisher registration (step 1) before the version bump
(step 2), leaving a real window. Added a guard in the publish step: after
partitioning the 5 platform + 1 root tarballs, extract the root tarball's
version and hard-fail with `::error::` before any `publish_or_skip` call if
it is empty or exactly "0.0.0". Added a matching regression test
(release-workflow.test.ts) asserting the guard text is present AND runs
before the platform-publish loop starts. Mutation-verified two ways: (1)
built 6 real npm-pack-shaped 0.0.0 tarballs + a mocked npm binary in a
worktree-local scratch dir, ran the extracted publish script under
`bash -e` -- confirmed zero publishes and exit 1 with the guard, confirmed
all 6 would have published (mock log entries) with the guard code removed;
(2) ran the full test suite with the guard block deleted from release.yml
-- exactly the new "refuses to publish 0.0.0" test failed (8/9 pass), then
restored and re-ran clean (9/9).

[minor] `publish_or_skip`'s name/version extraction (`read -r name version
<<< "$(tar -xzOf ... | node -e ...)"`) failed OPEN: a here-string always
supplies a trailing newline so `read` returns 0 even when the substitution
produced nothing, and `run:` steps execute under `bash -e` WITHOUT
`pipefail`, so neither a `tar` extraction failure nor a `node` JSON-parse
crash aborted the function -- `name`/`version` silently became empty,
`npm view "@" version` failed (indistinguishable from "not published"), and
the tarball published unconditionally, defeating the resumability feature
on exactly the scenario it exists for. Added an explicit emptiness check
immediately after the `read`, exiting 1 with a clear error before
`npm view`/`npm publish` are ever reached. Reproduced the reviewer's exact
scenario (6 tarballs with the wrong inner path) against the pre-fix script:
all 6 published unconditionally, logging `(@)` for name@version, exit 0 --
then confirmed the fixed script fails loud on the first bad tarball with
zero publishes. Mutation-verified via the test suite too: deleting the
guard fails exactly the new "fails loud (not open)" test (8/9 pass), then
restored (9/9).

[minor] release-publishing.md's "Dry-run rehearsal (verified)" section
claimed the dry-run reported the `os`/`cpu` gate; `npm publish --dry-run`
does not emit that. Reworded to say the dry-run reported name/version/file
list/access, and that os/cpu is asserted separately -- structurally by
verify-versions (against the committed npm/<platform>/package.json fields)
and behaviorally by the package job's explicit-tarball install (EBADPLATFORM
on mismatch). Also updated the First-release-checklist intro paragraph to
note the publish job's own 0.0.0 refusal is a last-resort backstop, not a
substitute for the checklist's version-bump item.

[nit] Reworded the Prerequisites npm->=11.5.1 bullet, which contradicted the
new workflow comment about node 24 not guaranteeing a new-enough bundled
npm -- now says CI explicitly upgrades (npm install -g npm@^11) and asserts
the floor rather than relying on the runner's bundled version.

[nit] Dated the ADR-0001 amendment to match sibling ADRs' convention:
"Amendment (LCLI-255)" -> "Amendment -- 2026-07-25 (LCLI-255)".

[nit] Applied both optional hardening suggestions: pinned the publish job's
`npm install -g npm@latest` to `npm@^11` (floor-plus-major, narrows the
compromised-npm-release window since this is the only id-token:write job);
added a job-scoped `concurrency: { group: release-publish, cancel-in-progress:
false }` to the publish job only (not workflow-level, so dry-run dispatches
stay unaffected) so overlapping publish:true dispatches queue instead of
interleaving.

Declined: the reviewer's secondary "optionally distinguish npm view's E404
from infra/network failures via --json + stderr capture" sub-suggestion
under the resumability minor -- explicitly marked optional by the reviewer,
adds meaningful complexity/new failure surface for a lower-severity edge
case (a transient registry outage misread as "not published" is a false
skip, not a false publish), and the guard that actually mattered for
this review pass (the empty-extraction fail-open) is fixed.

Re-verified full set: bun test (2119 pass, 0 fail, including
release-workflow.test.ts's 9 tests -- 2 new), bun run typecheck (clean),
bun run lint / biome check (clean), bun run src/cli.ts check (39 files, 0
errors, 0 warnings), actionlint .github/workflows/release.yml (clean),
shellcheck on the extracted publish script (clean). Also ran an independent
Codex (gpt-5.6-sol, xhigh) review pass over the uncommitted diff -- no
additional findings; confirmed the guard/concurrency/docs/test changes as
internally consistent. No version bump (all 6 manifests still 0.0.0);
CHANGELOG.md untouched; backlog/docs/ untouched; no scratch build artifacts
committed (rehearsal scratch dir removed via `git clean -fd` before
committing).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed review pass 2's major + minor findings in release.yml's publish job.
Added a pre-publish guard that hard-refuses version 0.0.0 (the placeholder)
before any tarball is published -- the one irreversible-action precondition
that every other check in this workflow enforced except this. Fixed
publish_or_skip's name/version extraction, which previously failed OPEN
(bash -e, no pipefail, a here-string always feeds `read` a line) and would
have published unconditionally on a malformed tarball, defeating the
resumability feature; it now asserts non-empty and exits loud instead.
Fixed the runbook's inaccurate claim that npm publish --dry-run reports the
os/cpu gate (it doesn't; that's verify-versions + the package job's
install-sanity EBADPLATFORM check) and its internally-contradictory
Prerequisites npm-floor wording. Dated the ADR-0001 amendment to match
sibling convention. Applied both optional hardening nits: npm@^11
floor-plus-major pin (was @latest, in the only id-token:write job) and a
job-scoped concurrency group on publish so overlapping publish:true
dispatches queue instead of interleaving. Declined one explicitly-optional
sub-suggestion (distinguishing npm view's E404 from infra failures) as
added complexity for a lower-severity edge case.

Verified: bun test (2119/2119, incl. 2 new regression tests, each
mutation-verified to fail exactly its own target and nothing else), 
typecheck, biome lint, lore check (39/0), actionlint, shellcheck on the
extracted publish script all clean. Reproduced the reviewer's exact
fail-open scenario against the pre-fix script (all 6 tarballs published
unconditionally with `(@)` name@version) and confirmed the fix blocks it.
An independent Codex (gpt-5.6-sol, xhigh) pass over the diff raised no
further findings. No version bump (all 6 manifests still 0.0.0); no
CHANGELOG.md edit; no backlog/docs/ edit; no scratch build artifacts
committed.
<!-- SECTION:FINAL_SUMMARY:END -->
