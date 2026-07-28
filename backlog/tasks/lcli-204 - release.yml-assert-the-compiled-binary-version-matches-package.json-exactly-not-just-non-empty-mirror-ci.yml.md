---
id: LCLI-204
title: >-
  release.yml: assert the compiled binary --version matches package.json
  exactly, not just non-empty (mirror ci.yml)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - build-ci-config
  - codex-review-followup
  - ci
  - release
dependencies: []
priority: low
type: chore
ordinal: 306000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Make `.github/workflows/release.yml`'s binary version checks assert an EXACT match against `package.json`'s `version`, the same way `.github/workflows/ci.yml`'s compile-smoke job already does — instead of only asserting non-empty output.

## Why it matters
release.yml is the actual release/packaging path, yet it is *weaker* than ci.yml's dev smoke: a compiled binary whose embedded `--version` diverges from `package.json` (e.g. a missed `--define`/version-bump, the exact failure the e2e Dockerfile guards against at docker/e2e/Dockerfile:75) would sail through release.yml's non-empty checks and ship the wrong version. ci.yml already proves the binary's `--version` equals `package.json`'s; release.yml should not be blind to it.

## Live locations (dev @ audit time)
- `.github/workflows/release.yml:208-213` — `build` job, the `if [ "${{ matrix.name }}" = "linux-x64" ]` block: `version="$("$bin" --version)"` followed only by `if [ -z "$version" ]`.
- `.github/workflows/release.yml:273-278` — `package` job "Install-sanity" step: `version="$(node node_modules/.bin/lore --version)"` followed only by `if [ -z "$version" ]`.
- Model to mirror: `.github/workflows/ci.yml:56-64` — reads `expected="$(bun -e 'console.log(require("./package.json").version)')"` and fails on `"$version" != "$expected"`.
- The `verify-versions` job (release.yml:47-161) already asserts package.json↔npm/* metadata consistency; leave it unchanged — this task only adds the *binary-output* comparison, which verify-versions does not do.

## Provenance
Codex second-opinion review (backlog doc-2), low-severity 'build-ci-config' cluster, round-3 re-audit. Still open on dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In release.yml's `build` job, the linux-x64 branch compares the compiled binary's `--version` output against `package.json`'s `version` (read the same way ci.yml does) and hard-fails with a clear `::error::` naming both values on mismatch — keeping the existing non-empty guard as the first check.
- [x] #2 In release.yml's `package` install-sanity step, the launcher-resolved binary's `--version` output is compared against the root `package.json` version and hard-fails with a clear `::error::` on mismatch — keeping the existing non-empty guard as the first check.
- [x] #3 The comparison logic mirrors ci.yml build job (lines 56-64) rather than introducing a divergent mechanism; the release.yml `verify-versions` job is left unchanged.
- [x] #4 The workflow YAML remains syntactically valid (parses / actionlint-clean) and the two checks pass today (binary --version equals package.json version).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In build job linux-x64 branch (release.yml ~208-214): after existing non-empty guard on version, add expected=$(bun -e 'console.log(require("./package.json").version)') mirroring ci.yml:56-64, then hard-fail with ::error naming both binary and package.json values on strict mismatch.
2. In package job's Install-sanity step (~272-289): same pattern for the launcher-resolved binary version — but since this job has no setup-bun step (uses node/npm only), read expected via node -p "require('./package.json').version" (matching the node -p already used earlier in this same job) instead of bun -e, to avoid depending on a toolchain not installed in this job. Comparison/hard-fail logic mirrors ci.yml exactly; only the read-mechanism tool (node vs bun) differs, justified by job's available toolchain.
3. Leave verify-versions job (lines 47-161) untouched.
4. Verify: bun test (full suite), bun run typecheck, and validate release.yml YAML parses (js-yaml or actionlint if present).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: build job linux-x64 branch (release.yml) now computes expected=$(bun -e 'console.log(require("./package.json").version)') (mirrors ci.yml:56-64 exactly, bun available there via setup-bun) and hard-fails with ::error naming both binary/package.json values on mismatch, after the existing non-empty guard. package job's Install-sanity step adds the same strict-equality/::error hard-fail pattern, but reads expected via 'node -p' instead of 'bun -e' since that job has no setup-bun step (only node/npm) — matches the node -p already used earlier in that same job for the same purpose; documented via an inline comment. verify-versions job left untouched (AC#3).

Verification: bun test => 1913 pass, 0 fail (5385 expect calls). bun run typecheck => clean (tsc --noEmit, no output). actionlint .github/workflows/release.yml => exit 0, no findings. js-yaml load of release.yml => 'YAML OK'. AC#4 real-binary proof: compiled src/cli.ts inside the worktree checkout (same filesystem, avoiding the known cross-device 0-byte trap) — binary --version printed '0.0.0', and both $(bun -e ...) and $(node -p ...) read package.json version as '0.0.0' — strict match confirmed both ways today.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
release.yml's binary --version checks now assert an EXACT match against package.json's version (not just non-empty), mirroring ci.yml's compile-smoke job. (1) build job's linux-x64 branch computes expected via 'bun -e' (same as ci.yml:56-64, bun is set up there) and hard-fails with ::error naming both values on mismatch, keeping the prior non-empty guard first. (2) package job's Install-sanity step adds the same strict comparison for the launcher-resolved binary, reading expected via 'node -p' (matching the node-based pattern already used elsewhere in that job, since it has no bun toolchain) — comparison/hard-fail logic mirrors ci.yml exactly; only the read tool differs, justified and documented inline. verify-versions job (lines 47-161) is unchanged. Verified: bun test 1913 pass/0 fail, bun run typecheck clean, actionlint clean, js-yaml parse OK, and a real in-checkout compile proved both bun- and node- read package.json versions strictly match the compiled binary's --version output today.
<!-- SECTION:FINAL_SUMMARY:END -->
