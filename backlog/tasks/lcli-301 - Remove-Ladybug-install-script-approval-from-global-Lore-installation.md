---
id: LCLI-301
title: Remove Ladybug install-script approval from global Lore installation
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 04:37'
updated_date: '2026-08-04 05:11'
labels: []
dependencies: []
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
type: bug
ordinal: 414000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Installing @opum-ai/lore globally with current npm reports or blocks @ladybugdb/core's install lifecycle unless the user passes --allow-scripts=@ladybugdb/core. The published launcher should install and run under npm's default lifecycle-script policy without requiring a security-policy exception, while preserving the qualified native-index behavior on supported hosts and reference fallback on Windows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A default global npm installation of the packed launcher and matching platform package reports no unapproved install scripts and runs lore successfully
- [x] #2 The published launcher dependency graph contains no package lifecycle script that requires user approval
- [x] #3 Native Ladybug indexing remains available on qualified macOS and Linux builds, while Windows retains reference fallback
- [x] #4 Release qualification and tests fail if an install-script dependency is reintroduced
- [x] #5 Installation and release documentation describe the script-free global install contract
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep source/runtime libraries as repository build dependencies while publishing only the Node launcher plus script-free optional platform packages. 2. Persist a narrow @ladybugdb/core loader patch that makes Bun embed the matching N-API addon into macOS/Linux executables; externalize the unreachable Ladybug import in Windows fallback builds. 3. Extend matching-host qualification to perform a real isolated global npm install without --allow-scripts, assert @ladybugdb/core is absent, force installed macOS/Linux binaries through indexed retrieval, and retain Windows reference fallback. 4. Refresh the fixture Backlog shim, unit/workflow contracts, installation docs, and run strict package/Lore validation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis: npm global installs do not honor a dependency package's Bun trustedDependencies declaration; npm's global-context policy therefore reported @ladybugdb/core's install script. The published compiled binary also retained the build workspace's addon path and silently fell back after relocation. A Bun patch replacing the dynamic process.dlopen path with a literal require embeds the qualified addon. An isolated npm 12 global install now succeeds without script approval, and the matching-host qualifier passes on darwin-arm64 with @ladybugdb/core absent from the installed tree and indexed retrieval required.

Final verification: isolated npm 12 global-install qualification passed on darwin-arm64 without --allow-scripts and proved the installed launcher graph excludes @ladybugdb/core while indexed retrieval succeeds from the embedded addon. The same qualifier passed in an arm64 Linux container. The Windows ARM64 executable cross-compiled with the addon externalized and was identified as a PE32+ Aarch64 binary. bun test passed 2,434 tests across 75 files; typecheck, lint, release workflow checks, lore validate --strict, lore check --strict, and git diff --check passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the Ladybug lifecycle-script requirement from the published launcher by making source libraries build-only, embedding the native addon into supported macOS/Linux executables, and externalizing it from Windows fallback builds. Added real no-approval global-install qualification and regression coverage, refreshed the fixture contract, and documented the script-free install boundary.
<!-- SECTION:FINAL_SUMMARY:END -->
