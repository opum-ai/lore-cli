---
id: LCLI-278
title: >-
  GitHub billing plan blocks required-reviewer protection on the release
  Environment
status: To Do
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-08-30 03:39'
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

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-30 03:39
---
OWNER DECISION 2026-08-29: the publish:true prohibition is LIFTED, deliberately and with the trade understood. Recorded here rather than only in the runbook, because this task is where the prohibition was reasoned and anyone re-reading it must find the decision that overrode it.

WHAT WAS DECIDED. Configure npm trusted publishing (OIDC) on all fourteen @opum-ai package names across lore and quest, then authorize 'publish: true' dispatches of the Release workflow.

WHAT IS BEING WAIVED, stated plainly so this is not read later as an oversight. The release GitHub Environment still has ZERO protection rules and administrator bypass enabled — GitHub returned 422 when a required reviewer was added, because the billing plan does not support it. So a publish has no approval independent of the workflow file. Anyone who can dispatch the workflow can publish. That is exactly the exposure this task exists to describe, and it is unchanged by trusted publishing, which fixes AUTHENTICATION and not APPROVAL.

WHY THE TRADE WAS TAKEN. The alternative is not 'a safer publish', it is 'a publish that keeps failing'. npm disabled classic token creation in November 2025 and revoked every classic token on 9 December 2025; granular tokens are capped at 90 days, require 2FA, and must be created on the website. Two of them were rejected outright on 2026-08-29 — 401 on whoami even in an isolated config — from two repositories with different packages. A token path is a credential in a file that expires inside a quarter and strands the release when it does; OIDC has no stored credential to leak at all. The residual risk moves from 'a long-lived secret on a laptop' to 'no second party approves a dispatch', which is the smaller of the two on a repository whose dispatch rights are already held by one person.

THIS TASK DOES NOT CLOSE. The control it asks for still does not exist. What changes is that the prohibition it imposed is no longer the operative rule. If the billing plan later supports required reviewers, configure one and the waiver stops being needed — that is still the right end state and this task should stay open until then.

DO NOT read this as 'the approval question is answered'. It was weighed and accepted, which is a different thing.
---
<!-- COMMENTS:END -->
