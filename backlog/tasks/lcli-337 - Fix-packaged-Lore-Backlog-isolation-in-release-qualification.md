---
id: LCLI-337
title: Fix packaged Lore Backlog isolation in release qualification
status: Done
assignee:
  - '@codex'
created_date: '2026-08-17 00:27'
updated_date: '2026-08-17 00:30'
labels:
  - release
  - backlog
  - packaging
  - regression
dependencies: []
priority: high
type: bug
ordinal: 460000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The v0.3.1 publish=false Release workflow failed matching-host package qualification on multiple platforms. The installed launcher still reports a non-JSON-capable Backlog task-list failure when its fixture root contains the protected environment sentinel, despite LCLI-335 fixing the direct adapter path. Repair the packaged launch/smoke integration without weakening secret protection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Installed platform packages can run the repository-local graph smoke against a protected environment sentinel without ambient environment-file loading.
- [x] #2 The logical Backlog project root remains available to Backlog while the subprocess executes from an isolated safe cwd.
- [x] #3 Package-qualification regression tests cover the installed launcher path and fail under the pre-fix behavior.
- [x] #4 Focused and full tests, package qualification, typecheck, lint, build, strict Lore validation/check, bridge checks, and diff hygiene pass.
- [x] #5 A new patch release plan accounts for the immutable v0.3.1 tag without publishing it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace the packaged release smoke to determine whether Lore, its launcher, or the fixture Backlog implementation loses the logical project root.
2. Make the fixture Backlog shim honor the adapter-provided logical root while retaining safe physical cwd isolation.
3. Add focused regression coverage for the installed-launcher/package-qualification boundary.
4. Qualify the fix and prepare a successor patch release because v0.3.1 is immutable.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: the fixture-only Backlog shim read its task snapshot from process.cwd(), whereas Lore now intentionally launches Backlog from an empty safe directory and supplies the project root via BACKLOG_CWD. The shim now honors BACKLOG_CWD, package qualification creates a chmod-000 .env sentinel, and the installed darwin-arm64 launcher qualification passes locally. Verification: focused shim/probe/package tests; lint; typecheck; build; full bun test; strict Lore validate/check; bridge check; diff hygiene. Created LCLI-338 for the immutable-tag successor release.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed release-blocking packaged Backlog isolation: fixture Backlog now uses BACKLOG_CWD, and matching-host package qualification exercises an unreadable environment sentinel. Verified with an installed darwin-arm64 package qualification plus the complete local suite and gates.
<!-- SECTION:FINAL_SUMMARY:END -->
