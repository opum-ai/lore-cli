---
id: LORE-99
title: >-
  verify-versions job doesn't check os/cpu fields or binary filenames; only
  linux-x64 build is executed
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 13:03'
labels:
  - codex-review-followup
  - build-ci-config
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The `verify-versions` job in .github/workflows/release.yml (lines 47-121) only compares the `version`, `license`, `author`, `repository`, and `optionalDependencies` pin between root package.json and each platform's npm/<name>/package.json — it never reads or validates the `os`/`cpu` fields (e.g. npm/linux-x64/package.json declares os:["linux"], cpu:["x64"]) or the compiled binary's expected filename. Separately, the build job's Verify step (lines 146-164) only actually executes the compiled binary and checks its `--version` output for the `linux-x64` matrix entry; the other four platforms (darwin-arm64, darwin-x64, linux-arm64, win32-x64) are only checked for a byte-size floor (>1MB), so a wrong-platform or corrupt-but-large binary would ship undetected for those four targets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 verify-versions reads each npm/<name>/package.json's `os` and `cpu` fields and fails the job (naming the mismatch) if they don't match the platform's expected values for that matrix entry
- [x] #2 verify-versions or the build Verify step asserts the compiled binary filename matches the expected `binary` value from the release matrix for every platform, not just linux-x64
- [x] #3 A deliberately mismatched os/cpu field or wrong binary filename in a platform package.json causes the workflow to fail with a descriptive error before publish
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In verify-versions job: replace PLATFORM_NAMES (names-only) env with PLATFORM_MATRIX (full setup-job matrix incl. binary field). 2. Derive expected os/cpu per platform from the platform name (split on first '-': darwin-arm64 -> os darwin/cpu arm64, win32-x64 -> os win32/cpu x64) and assert each npm/<name>/package.json's os/cpu arrays match exactly, pushing a descriptive problem string on mismatch (existing fail-loud/collect-all-problems pattern). 3. Assert each matrix entry's 'binary' value matches the os-derived expectation (lore.exe only for win32, lore otherwise) so a drift between the matrix and bin/lore.cjs's hardcoded BINARY_NAME is caught before any compile work. 4. In the build job's Verify step, add an explicit -f existence check for npm/<name>/bin/<matrix.binary> for every platform (not just linux-x64), failing with a descriptive ::error:: (naming the expected path) before the size/exec checks, instead of relying on an implicit stat failure. 5. Verify by extracting the embedded node -e script and running it against real repo data (pass) plus deliberately mutated os/cpu/binary fixtures (fail with descriptive messages); shellcheck + bash -n the build Verify step; python3 yaml.safe_load for YAML validity; bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified by extracting the embedded node -e script from verify-versions and running it standalone: (1) baseline PLATFORM_MATRIX against real repo npm/*/package.json files exits 0; (2) mutated linux-arm64 os to [darwin] -> fails with descriptive ::error:: naming the field, expected/actual, and platform; (3) mutated win32-x64 cpu to [arm64] -> same; (4) mutated the win32-x64 matrix entry binary to lore (should be lore.exe) -> fails naming the matrix entry and expected value; (5) truncated matrix to one platform -> pre-existing platform-set-drift check still fires (regression guard on the PLATFORM_NAMES->PLATFORM_MATRIX env swap); (6) pre-existing version/license checks re-verified still fire correctly after the rewrite. Also: python3 -c yaml.safe_load confirms release.yml stays valid YAML; node --check confirms the extracted script has valid syntax; shellcheck + bash -n on the rewritten build Verify step (with GH Actions expressions substituted for plain bash vars) is clean; bash -x simulation confirms the new explicit -f existence check in the build job's Verify step fails descriptively when the expected binary filename is absent, and passes when present, for a non-linux-x64 platform (previously only linux-x64 was exercised at all beyond the byte-size floor). bun run typecheck passes (repo-wide, unaffected since this is a YAML-only change).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
verify-versions now reads the full setup-job matrix (PLATFORM_MATRIX, replacing names-only PLATFORM_NAMES) and asserts each npm/<name>/package.json's os/cpu arrays match the platform-name-derived expectation (e.g. win32-x64 -> os:[win32], cpu:[x64]), plus asserts each matrix entry's binary field matches the os-derived expectation (lore.exe only for win32) — catching drift against bin/lore.cjs's hardcoded BINARY_NAME before any compile work. The build job's Verify step now explicitly asserts the expected npm/<name>/bin/<matrix.binary> file exists for every platform (not just linux-x64) with a descriptive ::error:: before falling through to the byte-size/exec checks. Verified via extracted-script execution against real + deliberately-mutated fixtures (os mismatch, cpu mismatch, wrong binary filename, and a regression check on the existing platform-set-drift/version/license checks), shellcheck+bash -n on the shell portions, python3 YAML validation, and bun run typecheck.
<!-- SECTION:FINAL_SUMMARY:END -->
