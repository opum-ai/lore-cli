---
id: LCLI-278
title: >-
  GitHub billing plan blocks required-reviewer protection on the release
  Environment
status: To Do
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-08-04 01:05'
labels:
  - release
  - repo-admin
  - security
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
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

2026-08-03 repository ownership update: GitHub transferred the repository to the canonical location opum-ai/lore-cli. The earlier audit endpoint under the former owner is retained above as historical evidence and now redirects to the transferred repository. All current Environment, ruleset, branch-protection, Actions, and npm Trusted Publisher instructions must use opum-ai/lore-cli. Post-transfer verification found the release Environment unchanged: zero protection rules, no deployment policy, and administrator bypass enabled, so this blocker remains open.

2026-08-03 owner disposition: keep opum-ai/lore-cli private for the 0.1.0 bootstrap and authorize the runbook's manual publish path. This does not satisfy the required-reviewer acceptance criteria and does not authorize Release publish:true; LCLI-278 remains To Do. Package-level Trusted Publishers may be configured after bootstrap, but future automated publication stays blocked until an effective out-of-file Environment control exists.
<!-- SECTION:NOTES:END -->
