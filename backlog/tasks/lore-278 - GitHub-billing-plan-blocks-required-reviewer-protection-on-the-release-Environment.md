---
id: LORE-278
title: >-
  GitHub billing plan blocks required-reviewer protection on the release
  Environment
status: To Do
assignee: []
created_date: '2026-07-27 04:11'
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
GitHub returned HTTP 422 when creating the release Environment with jeremy-newhouse as required reviewer: the current billing plan does not support required-reviewer protection. Do not create an unprotected Environment because the release workflow and npm trust design rely on this out-of-file approval gate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Upgrade or change repository plan/visibility so Environment required reviewers are supported, or approve and document a replacement control with equivalent out-of-file protection
- [ ] #2 Create release Environment with the repository owner as required reviewer and prevent-self-review disabled
- [ ] #3 Verify the Environment via GitHub API before any OIDC publish:true dispatch
<!-- AC:END -->
