---
id: LCLI-296
title: Publish Lore CLI 0.1.0 and bootstrap npm Trusted Publishing
status: To Do
assignee: []
created_date: '2026-08-04 01:02'
updated_date: '2026-08-04 01:06'
labels:
  - release
  - publication
  - npm
  - security
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies:
  - LCLI-295
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
  - docs/runbooks/release-publishing.md
priority: high
type: task
ordinal: 409000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cut Lore CLI's first immutable public release from the private opum-ai/lore-cli repository. Qualify one exact commit across all five supported hosts, bootstrap-publish the six @opum-ai packages manually in dependency-safe order, verify a clean registry install, create the v0.1.0 GitHub release, and configure each existing package's Trusted Publisher without claiming the still-unavailable GitHub required-reviewer control.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All six manifests and the five root optional-dependency pins use exact version 0.1.0, the launcher is packaged through bin/lore.cjs, and release documentation/changelog describe the same immutable version.
- [ ] #2 Release workflow publish:false passes version metadata, five-host build and executable package qualification, install-sanity, and produces exactly six retained tarballs from the tagged commit.
- [ ] #3 The five @opum-ai/lore platform packages are bootstrap-published public before @opum-ai/lore, using the qualified workflow artifacts and interactive account authentication without storing a long-lived npm token.
- [ ] #4 A clean registry install of @opum-ai/lore@0.1.0 resolves the matching platform package, reports 0.1.0, and registry metadata confirms all six packages are public.
- [ ] #5 Each package has a Trusted Publisher bound to GitHub opum-ai/lore-cli, workflow release.yml, environment release, and the selected allowed action; future automated publish:true remains blocked and documented until LCLI-278 resolves the private-repository Environment protection gap.
- [ ] #6 The v0.1.0 tag and GitHub release point to the qualified commit, release truth and Lore Story coupling are synchronized, strict project gates pass, and exact publication evidence is recorded without exposing credentials.
<!-- AC:END -->
