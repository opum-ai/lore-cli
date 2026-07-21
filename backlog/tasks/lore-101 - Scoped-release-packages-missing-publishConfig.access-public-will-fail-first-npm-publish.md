---
id: LORE-101
title: >-
  Scoped release packages missing publishConfig.access:public, will fail first
  npm publish
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
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The six `@salient-data/lore*` packages (root package.json and the five npm/<platform>/package.json manifests) have no `publishConfig` key anywhere in the tree, and release.yml has no publish job at all yet (only a TODO placeholder at lines 235-244). npm requires either `publishConfig.access: "public"` in a scoped package's manifest or an explicit `--access public` flag on `npm publish` for a scoped package's first publish, or the publish fails with an access-denied error (scoped packages default to private/restricted). docs/runbooks/release-publishing.md's existing publish-setup instructions (Trusted Publishing steps) don't mention this requirement either, so it will be missed when the publish job is written.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Root package.json and all five npm/<platform>/package.json manifests declare `"publishConfig": { "access": "public" }`, OR the eventual publish job in release.yml passes `--access public` explicitly for every one of the six packages
- [ ] #2 docs/runbooks/release-publishing.md's publish-setup instructions mention the scoped-package public-access requirement so it isn't dropped when the TODO publish job (release.yml lines 235-244) is implemented
- [ ] #3 A dry-run/simulated `npm publish` (e.g. `npm publish --dry-run`) for a scoped package under @salient-data succeeds without an access-related error
<!-- AC:END -->
