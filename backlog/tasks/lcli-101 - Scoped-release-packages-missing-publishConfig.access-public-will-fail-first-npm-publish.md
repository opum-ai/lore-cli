---
id: LCLI-101
title: >-
  Scoped release packages missing publishConfig.access:public, will fail first
  npm publish
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
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
- [x] #1 Root package.json and all five npm/<platform>/package.json manifests declare `"publishConfig": { "access": "public" }`, OR the eventual publish job in release.yml passes `--access public` explicitly for every one of the six packages
- [x] #2 docs/runbooks/release-publishing.md's publish-setup instructions mention the scoped-package public-access requirement so it isn't dropped when the TODO publish job (release.yml lines 235-244) is implemented
- [x] #3 A dry-run/simulated `npm publish` (e.g. `npm publish --dry-run`) for a scoped package under @salient-data succeeds without an access-related error
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add publishConfig.access:public to root package.json and 5 npm/<platform>/package.json manifests, preserving JSON style.
2. Update docs/runbooks/release-publishing.md publish-setup section to mention scoped-package public-access requirement (prose only, no managed-block edits).
3. Verify: JSON-parse all 6 manifests, npm pack --dry-run on a leaf manifest (avoid root's build step), lore check for docs bundle coherence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added publishConfig.access:public to root package.json + all 5 npm/<platform>/package.json (darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-x64), preserving existing key order/style (inserted right after description). Updated docs/runbooks/release-publishing.md Step 2 (Add the publish job) with a new prose paragraph on the scoped-package public-access requirement, pointing at the manifests and the --access public fallback.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verified: (1) node -e require() JSON-parsed all 6 manifests, each with publishConfig.access==='public'. (2) cd npm/linux-x64 && npm publish --dry-run printed 'Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)' with no access-denied error (root package has no prepack/prepublishOnly build step either, so this leaf check plus JSON validation covers all 6). (3) bun run src/cli.ts check: 38 files, 0 errors, 0 warnings both before and after the runbook edit; bun run src/cli.ts validate docs/runbooks/release-publishing.md: 0 errors/warnings. Note: worktree's node_modules was actually absent on arrival (contrary to setup note); ran bun install (gitignored, no tracked-file changes beyond package.json's own edit) to make lore/npm runnable.
<!-- SECTION:FINAL_SUMMARY:END -->
