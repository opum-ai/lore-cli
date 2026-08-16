---
id: LCLI-332
title: Release the Lore Backlog knowledge-adoption contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-14 18:04'
updated_date: '2026-08-16 13:24'
labels:
  - release
  - quest
  - backlog
  - migration
  - knowledge
  - quest-0.1-blocker
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies:
  - LCLI-331
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: high
type: task
ordinal: 455000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the first Lore release that contains the public Backlog knowledge-adoption contract required by Quest full-fidelity migration. Publication remains a separate owner-authorized action and must not be inferred from implementation completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The release version is selected according to Lore semver policy after checking the current published version
- [ ] #2 All platform artifacts contain the same knowledge-adoption manifest and behavior
- [ ] #3 Clean-install and migration smoke tests pass against the immutable release artifacts
- [ ] #4 Publication occurs only with explicit owner authorization and immutable release evidence is recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the live npm registry baseline and inspect the prior 0.2.0 release metadata/workflow path.
2. Bump all seven package versions and root optional-dependency pins to 0.3.0; update release-facing authored documentation and changelog without altering historical evidence.
3. Run release-relevant unit, build, packaging, Lore, and diff gates; obtain independent review.
4. Deliver the qualified release-preparation commit to dev, promote the verified commit to main, tag it, and run the Release workflow with publish disabled.
5. Hand the immutable tarballs and verification evidence to the owner for 2FA interactive publication; record registry/install/release evidence and settle LCLI-332.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner authorization recorded 2026-08-16: release scope including dev-to-main promotion, tag, seven public npm packages, and GitHub Release; target version 0.3.0; owner-authorized interactive publication path; owner performs external approval and npm 2FA publication. Automated publish remains prohibited while LCLI-278 is unresolved.
<!-- SECTION:NOTES:END -->
