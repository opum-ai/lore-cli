---
id: LCLI-361
title: >-
  docs/index.md still cites @opum-ai/lore@0.3.0 while 0.3.4 is the published
  version
status: To Do
assignee: []
created_date: '2026-08-28 23:59'
labels:
  - docs
  - release
  - drift
dependencies: []
ordinal: 488000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The root index's opening paragraph (docs/index.md:20) says lore is "released on npm as `@opum-ai/lore@0.3.0`", and line 59 describes the release-truth reference as carrying evidence "for `0.3.0`". The registry returned `@opum-ai/lore` at 0.3.4 unauthenticated on 2026-08-28, and LCLI-355 settled the 0.3.4 release with a published GitHub Release.

This is the first paragraph a reader — human or agent — sees in the bundle, so a stale version there is the most-read wrong fact in the docs. Noticed during LCLI-358.3 and deliberately left alone rather than fixed opportunistically inside an unrelated change.

Worth deciding once, not patching each release: whether that sentence should name a version at all, or point at the release-truth reference and let that one file carry the number. A version pinned in prose is a fact that goes stale on every release; a pointer does not.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/index.md no longer states a version that disagrees with the published package
- [ ] #2 The approach is decided explicitly — either the index cites the current version and a release step updates it, or it points at docs/reference/lore-cli-release-truth.md instead of naming one
- [ ] #3 lore check passes and any other in-bundle citation of the published version agrees
<!-- AC:END -->
