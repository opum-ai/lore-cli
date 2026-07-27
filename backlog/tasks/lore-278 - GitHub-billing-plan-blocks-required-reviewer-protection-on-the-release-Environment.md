---
id: LORE-278
title: >-
  GitHub billing plan blocks required-reviewer protection on the release
  Environment
status: To Do
assignee: []
created_date: '2026-07-27 04:11'
updated_date: '2026-07-27 05:05'
labels:
  - release
  - repo-admin
  - security
dependencies: []
priority: high
type: task
ordinal: 380000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub returned HTTP 422 when adding jeremy-newhouse as a required reviewer because the current billing plan does not support required-reviewer protection. A release Environment nevertheless exists in GitHub with zero protection rules, no deployment branch policy, and administrator bypass enabled. Treat it as unprotected and do not use publish:true until the plan/visibility changes or an equivalent out-of-file control is approved and configured.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Upgrade or change repository plan/visibility so Environment required reviewers are supported, or approve and document a replacement control with equivalent out-of-file protection
- [ ] #2 Create release Environment with the repository owner as required reviewer and prevent-self-review disabled
- [ ] #3 Verify the Environment via GitHub API before any OIDC publish:true dispatch
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Choose a supported out-of-file control: upgrade/change plan or visibility for required reviewers, or approve an equivalent protected-branch/deployment policy. 2. Configure the release Environment and remove unsafe bypass paths. 3. Verify protection rules via the GitHub API before any publish:true dispatch. 4. After the bootstrap publication, require the release environment claim in all six npm Trusted Publisher configurations.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-07-27 live audit: GET /repos/jeremy-newhouse/lore/environments reports release environment id 18793755127 with protection_rules: [], deployment_branch_policy: null, and can_admins_bypass: true. The prior statement that no unprotected environment was created was inaccurate; the environment exists but provides no gate.
<!-- SECTION:NOTES:END -->
