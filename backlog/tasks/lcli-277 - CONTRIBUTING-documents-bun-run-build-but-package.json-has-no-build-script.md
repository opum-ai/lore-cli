---
id: LCLI-277
title: CONTRIBUTING documents bun run build but package.json has no build script
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - build-ci-config
  - docs-drift
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
modified_files:
  - package.json
priority: medium
type: bug
ordinal: 379000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The contributor workflow documents bun run build as the compiled-binary validation command, but package.json did not define that script, so the documented release check failed immediately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 package.json defines bun run build using the repository's supported Bun compile command
- [x] #2 The built binary reports the package version and renders help
- [x] #3 Lint, typecheck, tests, and lore check remain green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ran bun run build, verified the resulting executable is non-empty, reports package.json's version, and renders the help banner. Lint, typecheck, full unit suite, lore check, and Docker E2E are green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the missing Bun compile script so the documented contributor and release validation command works.
<!-- SECTION:FINAL_SUMMARY:END -->
