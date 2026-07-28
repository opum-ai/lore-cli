---
id: LCLI-276
title: >-
  Release runbook cannot configure npm Trusted Publishing before first package
  publication
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - release
  - npm
  - docs-drift
dependencies: []
modified_files:
  - docs/runbooks/release-publishing.md
priority: high
type: bug
ordinal: 378000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first-release instructions required configuring npm Trusted Publishing before any of lore's six package names existed. npm only permits configuring a trusted publisher after a package exists, so the documented sequence could not bootstrap 0.1.0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The 0.1.0 sequence publishes the exact CI-built tarballs interactively with 2FA before configuring trust
- [x] #2 Platform packages are published before the root package
- [x] #3 The runbook clearly reserves publish:true OIDC dispatches for later releases
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed all six package names are unpublished and npm's trusted-publisher setup requires an existing package. The runbook now uses the exact publish:false artifact for the one-time interactive 2FA bootstrap.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reordered the 0.1.0 release procedure: CI packages first, five platform tarballs publish before root, then trust is configured for future OIDC releases.
<!-- SECTION:FINAL_SUMMARY:END -->
