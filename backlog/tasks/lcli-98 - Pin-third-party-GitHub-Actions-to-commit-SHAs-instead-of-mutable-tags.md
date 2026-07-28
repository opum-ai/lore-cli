---
id: LCLI-98
title: Pin third-party GitHub Actions to commit SHAs instead of mutable tags
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
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every external `uses:` reference across .github/actions/setup-bun/action.yml and .github/workflows/{ci,release}.yml is pinned to a mutable major-version tag (e.g. `oven-sh/setup-bun@v2`, `actions/cache@v5`, `actions/checkout@v6`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`, `actions/setup-python@v6`, `actions/setup-node@v5`) rather than a full commit SHA. A tag can be force-moved by the action owner (or an attacker who compromises the owner's account) to point at malicious code without any change on this repo's side, so CI and the release pipeline trust code whose content isn't actually pinned. No existing backlog task addresses this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every `uses:` line referencing a third-party (non-local) GitHub Action in .github/actions/setup-bun/action.yml, .github/workflows/ci.yml, and .github/workflows/release.yml specifies a full commit SHA rather than a version tag
- [x] #2 Each pinned action retains a trailing comment noting the human-readable version the SHA corresponds to, so future upgrades remain reviewable
- [x] #3 CI and release workflows still run successfully after the pin change (no broken action references)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Resolve each mutable-tag 'uses:' ref in .github/actions/setup-bun/action.yml, ci.yml, release.yml to its full 40-char commit SHA via git ls-remote against the upstream repo (verify no annotated-tag ^{} peel exists, so tag SHA == commit SHA). 2. Replace each uses: line's tag with the SHA, adding a trailing '# vX.Y.Z' comment for the human-readable version. 3. Leave local './.github/actions/setup-bun' refs untouched (not third-party). 4. Validate YAML stays parseable and re-verify each SHA resolves to the claimed tag.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Resolved all 7 third-party 'uses:' tags (oven-sh/setup-bun@v2, actions/cache@v5, actions/checkout@v6, actions/upload-artifact@v4, actions/download-artifact@v4, actions/setup-python@v6, actions/setup-node@v5) to full 40-char commit SHAs via git ls-remote against upstream, cross-verified with gh api commits/{sha} and gh api git/refs/tags/{version} (all matched). Confirmed no annotated-tag peel (^{}) exists for any of these tags, so the ls-remote SHA is the actual commit SHA, not a tag-object SHA. Added trailing '# vX.Y.Z' comment per pin. Left local './.github/actions/setup-bun' refs untouched (not third-party). Validated with: python3 yaml.safe_load on all 3 files (all OK), and actionlint on ci.yml + release.yml (exit 0, no findings). git diff confirms only the mutable-tag -> SHA substitution changed, no other drive-by edits.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pinned every third-party 'uses:' reference in .github/actions/setup-bun/action.yml, .github/workflows/ci.yml, and .github/workflows/release.yml from mutable major-version tags to full commit SHAs, each with a trailing '# vX.Y.Z' human-readable-version comment. Verified each SHA against the real tag via both 'git ls-remote' and 'gh api repos/.../commits/{sha}' + 'gh api repos/.../git/refs/tags/{version}' (all agree, confirming no tag-object/commit mismatch). Confirmed YAML validity (python3 yaml.safe_load) and workflow correctness (actionlint, exit 0, no findings) on all three files. Local './.github/actions/setup-bun' composite-action refs were correctly left as-is (not third-party).
<!-- SECTION:FINAL_SUMMARY:END -->
