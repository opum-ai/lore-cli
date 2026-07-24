---
id: LORE-255
title: >-
  First-release rehearsal: dry-run the dual-artifact npm publish end-to-end and
  write a first-release checklist
status: To Do
assignee: []
created_date: '2026-07-24 18:41'
labels:
  - build-ci-config
  - release
dependencies: []
references:
  - .github/workflows/release.yml
  - docs/runbooks/release-publishing.md
priority: medium
type: task
ordinal: 357000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
De-risk lore's first real npm publish by rehearsing the dual-artifact (launcher meta-package + 5 platform binary packages) publish path end-to-end and capturing a first-release checklist, so the actual cut is mechanical.

## Why it matters
release.yml is a well-engineered DRY-RUN only: it compiles all 5 platform binaries, packs all 6 packages, enforces version lockstep (verify-versions), and install-sanity-checks the launcher — but the actual npm publish leg is an unimplemented TODO and has NEVER been executed or dry-run'd. package.json is still version 0.0.0 across all six manifests. The one step that matters is untested, and several off-repo/manual prerequisites are easy to forget.

## Context
release.yml, docs/runbooks/release-publishing.md, bin/lore.cjs, package.json optionalDependencies pins. The real publish is additionally gated on LORE-253 + the upstream tag; this rehearsal + checklist are actionable now.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An 'npm publish --dry-run' of all 6 packages (root launcher + 5 platform) runs and its output is verified (correct files, os/cpu, bin, version).
- [ ] #2 A first-release checklist is documented in release-publishing.md covering: the coordinated 0.0.0->real version bump across all 6 manifests + the 5 optionalDependencies pins (what verify-versions enforces); flipping package.json bin.lore from src/cli.ts to bin/lore.cjs; the tag/CHANGELOG flow; npm OIDC trusted-publisher registration for all 6 packages; the publish job's id-token:write permission; and a post-publish smoke install of the launcher.
- [ ] #3 The currently-TODO publish job is either implemented (dispatch/tag-gated, with id-token:write and trusted publishing) or the checklist specifies exactly what remains to wire it.
<!-- AC:END -->
