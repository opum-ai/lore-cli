---
id: LCLI-321
title: Publish Lore CLI 0.2.0 from qualified release artifacts
status: To Do
assignee: []
created_date: '2026-08-09 05:46'
labels:
  - release
  - publication
  - npm
  - security
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies:
  - LCLI-320
references:
  - .github/workflows/release.yml
  - docs/runbooks/release-publishing.md
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
  - docs/reference/lore-cli-release-truth.md
priority: high
type: task
ordinal: 444000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish Lore CLI 0.2.0 only after release metadata is integrated into main and the exact commit passes the full main CI matrix. Tag and qualify all seven npm packages from one immutable commit, then use only a separately approved publication path. Release publish:true remains prohibited unless LCLI-278 is completed with a live, effective out-of-file approval control; otherwise any manual publication of qualified artifacts requires explicit owner authorization for this version. Publish platform packages before the root launcher, verify anonymous registry/install evidence, create the GitHub Release, and settle durable release truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The immutable v0.2.0 tag resolves to the exact verified main commit carrying the finalized 0.2.0 metadata
- [ ] #2 Release publish:false passes every blocking qualification and package gate and retains exactly seven untouched 0.2.0 tarballs from that commit
- [ ] #3 Before publication, either LCLI-278 is Done with the live external approval control verified or the owner explicitly authorizes a manual qualified-artifact path for 0.2.0; publish:true is never used while the current unprotected Environment persists
- [ ] #4 All six platform packages are published public before @opum-ai/lore from the exact qualified artifacts, with resumable checks preserving package-set consistency
- [ ] #5 Anonymous registry metadata, shasums/integrity, and a clean install confirm all seven 0.2.0 packages are public and the installed CLI reports 0.2.0
- [ ] #6 A non-draft, non-prerelease v0.2.0 GitHub Release and synchronized release truth, Story, task, campaign, and handover evidence record the publication and its authorization boundary
<!-- AC:END -->
