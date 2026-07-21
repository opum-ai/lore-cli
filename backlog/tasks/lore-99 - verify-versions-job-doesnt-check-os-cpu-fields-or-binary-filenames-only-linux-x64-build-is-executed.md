---
id: LORE-99
title: >-
  verify-versions job doesn't check os/cpu fields or binary filenames; only
  linux-x64 build is executed
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 verify-versions reads each npm/<name>/package.json's `os` and `cpu` fields and fails the job (naming the mismatch) if they don't match the platform's expected values for that matrix entry
- [ ] #2 verify-versions or the build Verify step asserts the compiled binary filename matches the expected `binary` value from the release matrix for every platform, not just linux-x64
- [ ] #3 A deliberately mismatched os/cpu field or wrong binary filename in a platform package.json causes the workflow to fail with a descriptive error before publish
<!-- AC:END -->
