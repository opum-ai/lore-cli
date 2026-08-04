---
id: LCLI-297
title: Ship a Windows ARM64 Lore binary
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 03:59'
updated_date: '2026-08-04 04:20'
labels:
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: medium
type: feature
ordinal: 410000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Windows ARM64 to Lore’s compiled release and npm distribution matrix so native ARM64 Node/npm installations on Windows receive a matching Lore executable. Preserve the approved Windows LadybugDB fallback policy when no compatible native addon is available.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The release workflow compiles and packages a win32-arm64 Lore executable on an appropriate matching host
- [x] #2 The root launcher package declares and resolves a win32-arm64 optional dependency with correct npm os/cpu metadata
- [x] #3 Release verification, qualification, packaging, and publish-count assertions include all supported platform packages without stale hard-coded counts
- [x] #4 Automated tests cover win32-arm64 launcher/package resolution and unsupported-platform messaging
- [x] #5 Release and platform-support documentation names Windows ARM64 and records its LadybugDB support policy
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Upgrade the single pinned Bun runtime to 1.3.14, the current tested release with Windows ARM64 runtime and compile-target support, and refresh every executable/toolchain pin. 2. Add win32-arm64 to the npm manifests and the derived release matrix on windows-11-arm. 3. Extend package qualification to represent an intentionally unavailable LadybugDB native addon on Windows ARM64 while proving Lore’s reference fallback, launcher, standalone binary, installation, and cleanup. 4. Replace fixed five-platform assumptions with the six-platform contract, extend tests, and update forward-looking release documentation without rewriting immutable 0.1.0 evidence. 5. Run unit/static/package checks, cross-compile Windows ARM64, and use native hosted qualification because winvm SSH authentication is unavailable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research: Bun 1.2.23 publishes no Windows ARM64 runtime asset. Bun Windows ARM64 assets begin at 1.3.10; local 1.3.14 successfully cross-compiled Lore after downloading the target runtime. @ladybugdb/core-win32-arm64@0.19.0 is not published, so Windows ARM64 must retain reference-fallback-only behavior without claiming or requiring a native addon. GitHub currently provides the windows-11-arm hosted ARM64 runner for private repositories. The provided winvm host rejected noninteractive SSH authentication.

Verification: Bun 1.3.14 cross-compiled dist/lore-windows-arm64.exe as PE32+ AArch64 (96,307,712 bytes). bun run typecheck, bun run lint, actionlint, 46 focused release/package tests, and the full 2,432-test suite passed. Docker's pinned Bun image exposes the verified multi-architecture digest. winvm SSH authentication was unavailable, so native qualification is configured on GitHub's windows-11-arm matching host.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Windows ARM64 as the sixth compiled/npm platform, upgraded the unified Bun pin to 1.3.14, modeled the unavailable LadybugDB addon as explicit reference-fallback evidence, derived release inventory counts from the platform matrix, and updated tests and release documentation. Verified by PE AArch64 cross-compilation, 2,432 full-suite tests plus 46 post-edit focused tests, typecheck, lint, actionlint, and strict Lore validation.
<!-- SECTION:FINAL_SUMMARY:END -->
