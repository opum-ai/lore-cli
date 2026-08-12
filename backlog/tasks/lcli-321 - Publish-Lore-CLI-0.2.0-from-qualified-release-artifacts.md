---
id: LCLI-321
title: Publish Lore CLI 0.2.0 from qualified release artifacts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-09 05:46'
updated_date: '2026-08-12 21:57'
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
- [x] #1 The immutable v0.2.0 tag resolves to the exact verified main commit carrying the finalized 0.2.0 metadata
- [x] #2 Release publish:false passes every blocking qualification and package gate and retains exactly seven untouched 0.2.0 tarballs from that commit
- [x] #3 Before publication, either LCLI-278 is Done with the live external approval control verified or the owner explicitly authorizes a manual qualified-artifact path for 0.2.0; publish:true is never used while the current unprotected Environment persists
- [x] #4 All six platform packages are published public before @opum-ai/lore from the exact qualified artifacts, with resumable checks preserving package-set consistency
- [x] #5 Anonymous registry metadata, shasums/integrity, and a clean install confirm all seven 0.2.0 packages are public and the installed CLI reports 0.2.0
- [ ] #6 A non-draft, non-prerelease v0.2.0 GitHub Release and synchronized release truth, Story, task, campaign, and handover evidence record the publication and its authorization boundary
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-ground live GitHub, npm, protected-branch, and release-control state; prove that v0.2.0 is unpublished and that publish:true remains prohibited.
2. Run the full CI workflow manually on the exact current main commit and require every blocking check to pass before tagging.
3. Create and push lightweight tag v0.2.0 at that exact verified main commit.
4. Dispatch Release with publish=false only; require every qualification/package gate to pass, then download the retained npm-packages artifact and verify exactly seven untouched 0.2.0 tarballs.
5. After npm owner authentication is restored, publish the six platform tarballs first and the root launcher last, checking registry state before each publish so an interrupted sequence resumes safely without rebuilding or repacking.
6. Verify anonymous registry metadata, shasums/integrity, and a clean install/version smoke; create the non-draft, non-prerelease GitHub Release.
7. Synchronize release truth, Story, task, campaign, and handover evidence through Lore/Backlog; pass strict documentation and repository gates; deliver settlement through protected branches.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checkpoint 2026-08-09: steps 1-4 complete. Exact artifact directory is /private/tmp/lore-cli-0.2.0-31317296988.j41WOO; GitHub artifact 9039171783 expires 2026-11-07. The browser npm login did not complete and was canceled at an interactive username prompt without collecting credentials. Resume only after the owner authenticates locally and npm whoami succeeds. Full per-package hashes and the resumable order are preserved in .claude/handovers/active.md.

Resume checkpoint 2026-08-12: live tag v0.2.0 still resolves to eb03eb2adcb7b391289955a5bdf5ba4b6f841017; qualification run 31317296988 remains successful; artifact 9039171783 remains unexpired through 2026-11-07 and was re-downloaded into a private temporary workspace. Exactly seven tarballs were recovered, and every recorded SHA-1 and SHA-512 integrity value matches the immutable qualification evidence. No v0.2.0 GitHub Release existed at that checkpoint and npm owner authentication was absent. No package was published or modified at that checkpoint.

Publication checkpoint 2026-08-12: owner npm login was restored and an authenticated preflight confirmed all seven exact 0.2.0 registry slots unused. The first platform publish attempt used the exact hash-verified Darwin ARM64 tarball, but npm rejected it before registry mutation with EOTP. A post-failure anonymous registry check confirmed the version remained absent; the owner then completed npm browser authorization and published that exact artifact successfully.

Publication evidence 2026-08-12: all six platform artifacts were published serially before the root launcher from the exact recovered qualification tarballs. After each platform publish, public registry SHA-1 and SHA-512 integrity matched the recorded artifact values; a cumulative six-platform gate matched before root publication. @opum-ai/lore@0.2.0 was then published last and its public SHA-1 8ddd22d19a8489a7c6d706fc94345cc0a55f8391 and recorded SHA-512 integrity matched. An anonymous clean npm install selected @opum-ai/lore-darwin-arm64@0.2.0 beside the 0.2.0 root, and the installed lore --version returned 0.2.0. The non-draft, non-prerelease GitHub Release now exists for v0.2.0. No package was rebuilt, repacked, renamed, or published out of order.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-09 13:54
---
Owner authorization received on 2026-08-09 via "authorize manual publication". This authorizes the manual publication of exact publish:false-qualified v0.2.0 artifacts. It does not authorize Release publish:true, which remains prohibited while LCLI-278 is open and the live release Environment has no protection rules or deployment policy. Preflight also found npm whoami returns E401; no immutable tag will be created until exact-main CI passes, and registry mutation will wait for restored npm owner authentication.
---

author: @codex
created: 2026-08-09 14:01
---
AC#1 evidence: exact-main CI run 31317080475 passed all nine jobs on eb03eb2adcb7b391289955a5bdf5ba4b6f841017; lightweight tag v0.2.0 was then created and pushed, and resolves directly to that commit. AC#3 evidence: owner explicitly authorized the manual qualified-artifact route on 2026-08-09; live release Environment audit found zero protection rules, no deployment policy, and admin bypass; Release run 31317296988 was dispatched on v0.2.0 with publish=false and scale observation false. No publish:true dispatch was used.
---

author: @codex
created: 2026-08-09 14:06
---
AC#2 evidence: Release run 31317296988 executed on v0.2.0 / eb03eb2adcb7b391289955a5bdf5ba4b6f841017 with publish=false and passed every blocking gate, six matching-host qualifications, acceptance-evidence assembly, and package/install-sanity; optional scale observation and OIDC publish were skipped. Artifact 9039171783 (npm-packages, 232114981 bytes, archive digest sha256:8abb10f32b5dfd3917817ae1e26c113515d1f63826c3c209fe1cdaa62dba4f58, expires 2026-11-07) was downloaded to a private temporary directory and contains exactly seven distinct 0.2.0 tarballs: six platform packages plus @opum-ai/lore. Each tarball was read-only inventoried with SHA-1, SHA-256, and SHA-512 integrity; no rebuild or repack occurred.
---
<!-- COMMENTS:END -->
