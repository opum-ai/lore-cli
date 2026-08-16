---
id: LCLI-336
title: Prepare Lore CLI 0.3.1 patch release metadata
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-16 22:16'
updated_date: '2026-08-16 22:24'
labels:
  - release
  - patch
  - npm
  - workspace
dependencies: []
priority: high
type: task
ordinal: 459000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prepare the 0.3.1 patch release for the delivered workspace-agent guidance and protected-environment Backlog probe fix. Update every shipped package version and exact optional-dependency pin, changelog, and release-truth documentation; validate the exact release candidate before the owner performs the separately authorized manual publication.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root and all six platform package manifests use version 0.3.1, and the root exact optional-dependency pins match.
- [x] #2 CHANGELOG and release documentation accurately describe the 0.3.1 patch and preserve the manual publication control boundary.
- [x] #3 Package/version qualification, full tests, lint, typecheck, build, strict Lore validation/check, bridge checks, and diff hygiene pass on the release candidate.
- [ ] #4 The release-preparation change is merged to dev and promoted to main before tag/workflow qualification.
- [ ] #5 Manual publication instructions use only release-workflow-built artifacts and include registry/install verification.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Align all shipped manifest versions and exact optional dependency pins at 0.3.1.
2. Document the patch and retain workflow-artifact-only manual publication controls.
3. Qualify the candidate locally, then deliver it through dev and main.
4. Tag verified main, run Release with publish=false, and hand the owner exact artifact-only publication and verification commands.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Candidate qualification passed: version/pin assertion; npm run build; bun test; npm run lint; npm run typecheck; npm run lore -- agents --check; npm run lore -- check --strict; npm run lore -- validate --strict; and git diff --check. The release runbook now requires artifacts from Release (publish=false), platform packages before root, registry verification, and a clean install. Delivery, tag/workflow, and owner publication remain pending.
<!-- SECTION:NOTES:END -->
