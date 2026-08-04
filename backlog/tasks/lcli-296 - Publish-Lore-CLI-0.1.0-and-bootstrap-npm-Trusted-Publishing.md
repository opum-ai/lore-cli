---
id: LCLI-296
title: Publish Lore CLI 0.1.0 and bootstrap npm Trusted Publishing
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 01:02'
updated_date: '2026-08-04 01:38'
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
modified_files:
  - CHANGELOG.md
  - README.md
  - backlog/tasks/lcli-295 - Rename-unpublished-npm-package-family-to-opum-ai.md
  - >-
    backlog/tasks/lcli-296 -
    Publish-Lore-CLI-0.1.0-and-bootstrap-npm-Trusted-Publishing.md
  - benchmark/ladybug/fixtures/v1/large.json
  - benchmark/ladybug/fixtures/v1/small.json
  - bun.lock
  - docs/log.md
  - docs/reference/lore-cli-release-truth.md
  - docs/runbooks/release-publishing.md
  - docs/stories/prepare-the-first-lore-cli-release.md
  - npm/darwin-arm64/package.json
  - npm/darwin-x64/package.json
  - npm/linux-arm64/package.json
  - npm/linux-x64/package.json
  - npm/win32-x64/package.json
  - package.json
  - test/ladybug-benchmark-report.test.ts
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
- [x] #1 All six manifests and the five root optional-dependency pins use exact version 0.1.0, the launcher is packaged through bin/lore.cjs, and release documentation/changelog describe the same immutable version.
- [ ] #2 Release workflow publish:false passes version metadata, five-host build and executable package qualification, install-sanity, and produces exactly six retained tarballs from the tagged commit.
- [ ] #3 The five @opum-ai/lore platform packages are bootstrap-published public before @opum-ai/lore, using the qualified workflow artifacts and interactive account authentication without storing a long-lived npm token.
- [ ] #4 A clean registry install of @opum-ai/lore@0.1.0 resolves the matching platform package, reports 0.1.0, and registry metadata confirms all six packages are public.
- [ ] #5 Each package has a Trusted Publisher bound to GitHub opum-ai/lore-cli, workflow release.yml, environment release, and the selected allowed action; future automated publish:true remains blocked and documented until LCLI-278 resolves the private-repository Environment protection gap.
- [ ] #6 The v0.1.0 tag and GitHub release point to the qualified commit, release truth and Lore Story coupling are synchronized, strict project gates pass, and exact publication evidence is recorded without exposing credentials.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Ground the exact merged base, registry emptiness, npm authentication capability, GitHub release Environment state, and absence of v0.1.0. 2. On an isolated release branch, set root and five platform versions plus exact optional-dependency pins to 0.1.0, flip the root bin to bin/lore.cjs, and update changelog/release documentation without claiming publication. 3. Run frozen install, manifest/package dry-runs, focused/full tests, lint/typecheck/actionlint, strict Lore gates, adversarial review, then deliver through a reviewed PR into dev. 4. Tag the exact merged release commit v0.1.0, dispatch Release with publish:false on that tag, require every five-host executable qualification and package job to pass, download the retained npm-packages artifact, and verify six exact tarballs/checksums/metadata. 5. Using interactive npm authentication and only those workflow tarballs, publish five platform packages first and @opum-ai/lore last, then verify all registry versions and a clean npx install. 6. Create the GitHub v0.1.0 release, configure each package Trusted Publisher for opum-ai/lore-cli release.yml with environment release, keep publish:true blocked by LCLI-278, reconcile release truth/Story/task/tracker state, and deliver the closure documentation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-03 activation grounding: LCLI-295 is Done after PR #296 merged as 4a1cda8dadf591ff33e7c27a8ee60a13258254cc with all eight CI jobs passing. The user explicitly authorized the private-repository manual bootstrap publication. The release Environment remains unprotected, so Release publish:true is out of scope and prohibited; only publish:false qualification plus interactive npm publication is allowed.

2026-08-03 release-candidate implementation: set all six manifests and five exact optional-dependency pins to 0.1.0, changed root bin.lore to bin/lore.cjs, opened the 0.1.0 changelog section, and updated pre-publication README/runbook/release truth without claiming a release. The version is deliberately part of deterministic Ladybug export evidence, so the small/large canonical export hashes and the report contract digest changed; source-inventory and task-snapshot hashes remained identical. Verification passed: frozen Bun install with no changes; six npm pack dry-runs with exact opum-ai-lore*-0.1.0.tgz names and root launcher included; 25 focused tests, 8 fixture/report tests, and all 2431 tests; lint, typecheck, actionlint, strict Lore validate/check, zero orphans/dangling links, and diff hygiene.

2026-08-03 PR #297 gate correction: Windows CI completed 2,338 tests but the pinned 700k-row Ladybug fixture took 31.969 seconds and exceeded the existing 30-second per-test ceiling. The candidate now keeps Windows max-concurrency=4 while bounding that host at 45 seconds; a workflow contract assertion protects the limit. Focused CI-workflow tests (5/5), lint, and diff hygiene pass locally. No merge, tag, workflow dispatch, or registry mutation occurred while this gate was red.
<!-- SECTION:NOTES:END -->
