---
id: LCLI-294
title: Transfer Lore CLI repository to opum-ai and reconcile canonical location
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-03 22:22'
updated_date: '2026-08-03 22:28'
labels:
  - repo-admin
  - repository-migration
  - documentation
  - release
  - 'doc:stories/maintain-lore-cli-documentation-authority'
dependencies: []
references:
  - >-
    https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository
  - 'https://docs.npmjs.com/trusted-publishers/'
documentation:
  - docs/index.md
  - docs/reference/lore-cli-documentation-ownership.md
  - docs/reference/lore-cli-release-truth.md
  - docs/runbooks/lore-cli-handover.md
  - docs/runbooks/release-publishing.md
  - docs/stories/maintain-lore-cli-documentation-authority.md
modified_files:
  - package.json
  - npm
  - docs
  - README.md
  - CHANGELOG.md
  - .github
priority: high
type: chore
ordinal: 407000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move the private Lore CLI GitHub repository from salient-data/lore-cli to opum-ai/lore-cli, then reconcile every active repository-owned route, package manifest, release control, action reference, and documentation claim with the canonical new location. Preserve historical provenance where an old URL identifies a past event, but eliminate stale operational instructions and verify that GitHub settings and redirects survive the transfer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GitHub reports the repository canonical full name as opum-ai/lore-cli, the local origin uses that URL, and the former source URL redirects to the transferred repository
- [ ] #2 Active package manifests, release controls, action examples, changelog links, repository metadata, and Lore documentation use opum-ai/lore-cli with no stale operational salient-data/lore-cli or jeremy-newhouse/lore routes
- [ ] #3 Historical references that must retain an old repository identity are explicitly classified as provenance and do not function as current instructions
- [ ] #4 Post-transfer GitHub audit verifies visibility, default branch, Actions workflows, environments, rulesets or branch protections, collaborators or teams, and release state; any lost control is either restored within authorization or recorded as an exact blocker
- [ ] #5 Lore synchronization, strict validation, strict checking, focused repository-reference tests, and Git diff hygiene pass after the migration
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Couple LCLI-294 to the existing documentation-authority Story with Lore, then reconcile the Story rollup.
2. Transfer the private repository from salient-data/lore-cli to opum-ai/lore-cli through GitHub's repository-transfer API, poll until the canonical owner changes, verify the former URL redirects, and update the local origin URL.
3. Compare post-transfer GitHub state with the pre-transfer snapshot: private visibility, dev default branch, three active workflows, release Environment, repository ruleset, dev/main protection state, collaborator/team counts, Actions policy, secrets/hooks counts, and zero tags/releases. Record any organization-policy changes or lost controls.
4. Replace current operational repository references with opum-ai/lore-cli across all six package manifests, README action usage, CHANGELOG links, active Lore docs, release commands, and repository-slug tests. Preserve old URLs only where they are immutable historical provenance and classify them accordingly.
5. Run Lore sync, strict validation/checking, Story rollup/orphan checks, focused tests and stale-reference scans, package consistency checks, and git diff hygiene. Record exact evidence in LCLI-294.
6. After explicit delivery authority, commit the remaining migration changes, push a feature branch to the transferred repository, open a PR, wait for required CI, merge only if authorized, and perform a final remote/redirect/control audit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-03 pre-transfer grounding: clean dev at d6dd5f5b4eb1db59742af71da0035bf6e920865a before task creation; source GitHub repository salient-data/lore-cli is private, unarchived, default branch dev, and the authenticated identity has repository admin plus active opum-ai organization admin membership. Target opum-ai/lore-cli returned 404, so the name is available. Pre-transfer controls: three active workflows; release Environment exists with zero protection rules, no deployment policy, and administrator bypass enabled; one active repository branch ruleset protects dev while main is unprotected; one collaborator, zero teams; Actions enabled with all actions allowed and no SHA-pinning requirement; zero Actions secrets, zero hooks, zero releases, and zero tags. Local inventory found current operational references in six package manifests, README, CHANGELOG, ADR-0001, tech-stack, release-publishing, and one repository-slug test. Backlog historical records also contain old identities and will remain provenance unless a live task carries an operational instruction. No transfer, source/docs edit, Lore coupling commit, push, PR, merge, release, or publication has occurred yet.
<!-- SECTION:NOTES:END -->
