---
id: LORE-98
title: Pin third-party GitHub Actions to commit SHAs instead of mutable tags
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - build-ci-config
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every external `uses:` reference across .github/actions/setup-bun/action.yml and .github/workflows/{ci,release}.yml is pinned to a mutable major-version tag (e.g. `oven-sh/setup-bun@v2`, `actions/cache@v5`, `actions/checkout@v6`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`, `actions/setup-python@v6`, `actions/setup-node@v5`) rather than a full commit SHA. A tag can be force-moved by the action owner (or an attacker who compromises the owner's account) to point at malicious code without any change on this repo's side, so CI and the release pipeline trust code whose content isn't actually pinned. No existing backlog task addresses this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every `uses:` line referencing a third-party (non-local) GitHub Action in .github/actions/setup-bun/action.yml, .github/workflows/ci.yml, and .github/workflows/release.yml specifies a full commit SHA rather than a version tag
- [ ] #2 Each pinned action retains a trailing comment noting the human-readable version the SHA corresponds to, so future upgrades remain reviewable
- [ ] #3 CI and release workflows still run successfully after the pin change (no broken action references)
<!-- AC:END -->
