---
id: LCLI-313
title: Publish Lore CLI 0.1.1 from qualified release artifacts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 21:04'
updated_date: '2026-08-04 23:38'
labels:
  - release
  - publication
  - npm
  - security
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
references:
  - .github/workflows/release.yml
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
  - docs/runbooks/release-publishing.md
modified_files:
  - .github/actions/setup-bun/action.yml
  - .github/workflows/release.yml
  - benchmark/ladybug/package-build.ts
  - benchmark/ladybug/package-qualification.ts
  - benchmark/ladybug/file-capture-helper.cjs
  - bin/lore.cjs
  - test/ladybug-package-qualification.test.ts
  - docs/reference/lore-cli-release-truth.md
  - docs/runbooks/release-publishing.md
  - docs/stories/prepare-the-first-lore-cli-release.md
  - docs/log.md
priority: high
type: task
ordinal: 426000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ship Lore CLI 0.1.1 from the exact verified main commit. Tag and qualify the seven-package release, bootstrap the new Windows ARM64 package, publish all platform packages before the root launcher through the explicitly authorized interactive path, verify public registry/install evidence, create the GitHub Release, and preserve LCLI-278 as the blocker for automated publish:true.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The immutable v0.1.1 tag resolves directly to the exact fully verified main commit
- [ ] #2 Release publish:false passes all blocking gates, qualifies all six matching hosts including Windows ARM64, and retains exactly seven 0.1.1 tarballs
- [ ] #3 All six platform packages are published public before @opum-ai/lore from the untouched qualified artifacts, without using Release publish:true
- [ ] #4 The new @opum-ai/lore-win32-arm64 package has the intended Trusted Publisher and the existing package trust relationships remain valid
- [ ] #5 Anonymous registry metadata and a clean install confirm all seven 0.1.1 packages are public and the installed CLI reports 0.1.1
- [ ] #6 A non-draft v0.1.1 GitHub Release and synchronized release truth, Story, task, and campaign evidence record the publication while LCLI-278 remains open
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Ground the exact main commit, registry/tag/release absence, live release controls, npm authentication, and prior release procedure. 2. Tag and dispatch Release with publish=false; if qualification fails before publication, remove the tag, repair the exact blocker through protected dev/main delivery, and re-cut only after fresh CI. 3. Require every blocking qualification/package job to pass, download the retained artifacts, and verify exactly seven untouched tarballs, metadata, checksums, and Windows ARM64 evidence. 4. Re-authenticate interactively, publish absent platform packages first and the root launcher last from those exact artifacts, then configure/list the Windows ARM64 Trusted Publisher. 5. Verify anonymous registry metadata and a clean installed CLI, create the GitHub Release, update release truth through Lore, finalize the task/campaign, deliver the settlement, and prune temporary state.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Release run 30950940227 used exact tag target 58537a71 with publish=false. Metadata, concurrency, bounded Ladybug, Darwin ARM64/x64, and Linux ARM64/x64 qualifications passed. Windows ARM64 failed before build because the shared frozen install ran @ladybugdb/core source compilation on the unsupported host; Windows x64 compiled with @ladybugdb/core external and the installed dependency-free binary then failed --version resolving that module. These are real release-contract defects, not runner flakes. No package, GitHub Release, or registry version was created. Per the pre-publication rollback procedure, remove v0.1.1, repair through protected delivery, and requalify from a new exact main commit.

Qualification repair implemented. The shared setup action now accepts a default-off ignore-scripts input used only by the Windows ARM64 release matrix entry, preserving frozen dependency metadata without invoking unsupported Ladybug source compilation. A dedicated Bun build helper uses a Windows-only resolver plugin to embed a reference-only @ladybugdb/core module instead of leaving an unresolved external import; non-Windows targets retain the native addon build. Verification passed: focused release suites 28/28 with 223 assertions; full suite 2451/2451 with 8304 assertions; lint across 187 files; typecheck; actionlint; build and dist/lore --version 0.1.1; native macOS package helper execution; 99 MB Windows x64 cross-compile; Biome and diff hygiene. Adversarial self-review confirmed the script skip is scoped only to the unsupported host, native platforms remain unchanged, and the published Windows binaries retain explicit reference-fallback behavior without runtime dependencies.

2026-08-04 qualification attempt 30954518410: five native hosts passed; win32-arm64 built, packed, and installed successfully but the Bun test harness lost stdout across the Node launcher nested stdio-inherit boundary, reporting no version after a zero exit. Packaging and publish jobs did not run; remote/local v0.1.1 tags were rolled back. Repair branch release/0.1.1-win-arm-capture uses disk-backed inherited-output capture for all launcher smoke commands. Local evidence: focused 12/12, full 2452/2452, lint/typecheck, and complete darwin-arm64 package qualification all pass.

2026-08-04 qualification attempt 30956752582: all prerequisites and four Unix native hosts passed. Both Windows hosts built, packed, and installed, then failed identically because the qualification harness captured no version from the Node launcher; package and publish jobs did not run and v0.1.1 was rolled back locally and remotely. This proves the blocker is shared Windows stdio inheritance, not the Windows ARM64 build or its deliberate Ladybug reference fallback. The next repair makes Node own file-backed stdout/stderr handles before it spawns the launcher, avoiding Bun-created Windows handles. Local verification passes: focused 12/12, lint, typecheck, full 2452/2452 with 8306 assertions, diff hygiene, and complete darwin-arm64 build/pack/global install/project install/launcher parity/native probe/uninstall cleanup qualification.

2026-08-04 qualification attempt 30958847529: prerequisites and all four Unix matching-host qualifications passed. Both Windows x64 and ARM64 again built, packed, and installed, then returned exit 0 with empty launcher stdout at the identical global-version assertion. Package assembly and publish remained skipped, nothing was published, and v0.1.1 was removed locally and remotely. The retained artifacts contain both Windows tarballs, confirming this is not an ARM64 or Ladybug build failure. Root cause is the published Node launcher passing redirected Windows handles directly to the compiled Bun child. The next repair keeps POSIX behavior unchanged, but on Windows gives the compiled executable Node-owned stdout/stderr pipes and streams them through the launcher without a spawnSync buffer limit. A Windows-only test now builds and invokes a real Bun executable through the exact published launcher; focused local tests pass 18/18 with one platform skip, plus Biome and diff hygiene.

2026-08-04 qualification attempt 30960331046: exact tag target be96b7d4 passed metadata, Ladybug prerequisites, and all four Unix matching-host qualifications. Both Windows packages again built, packed, and installed, then failed the unchanged empty global-launcher version assertion; assembly and publish stayed skipped, nothing was published, and v0.1.1 was rolled back. Protected Windows CI had already passed the new real compiled-Bun launcher test twice, proving the repaired launcher works when Bun captures it directly. Release alone still routed it through file-capture-helper.cjs, where the launcher's streamed output was lost. The next repair deletes that obsolete helper and makes global/project launcher smoke use the same direct Bun-pipe capture path proven by Windows CI. This remains shared Windows harness behavior and is independent of the Windows ARM64 Ladybug reference-fallback policy.
<!-- SECTION:NOTES:END -->
