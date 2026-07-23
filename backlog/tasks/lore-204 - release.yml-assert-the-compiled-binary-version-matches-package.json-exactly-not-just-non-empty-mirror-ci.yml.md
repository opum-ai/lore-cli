---
id: LORE-204
title: >-
  release.yml: assert the compiled binary --version matches package.json
  exactly, not just non-empty (mirror ci.yml)
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 In release.yml's `build` job, the linux-x64 branch compares the compiled binary's `--version` output against `package.json`'s `version` (read the same way ci.yml does) and hard-fails with a clear `::error::` naming both values on mismatch — keeping the existing non-empty guard as the first check.
- [ ] #2 In release.yml's `package` install-sanity step, the launcher-resolved binary's `--version` output is compared against the root `package.json` version and hard-fails with a clear `::error::` on mismatch — keeping the existing non-empty guard as the first check.
- [ ] #3 The comparison logic mirrors ci.yml build job (lines 56-64) rather than introducing a divergent mechanism; the release.yml `verify-versions` job is left unchanged.
- [ ] #4 The workflow YAML remains syntactically valid (parses / actionlint-clean) and the two checks pass today (binary --version equals package.json version).
<!-- AC:END -->
