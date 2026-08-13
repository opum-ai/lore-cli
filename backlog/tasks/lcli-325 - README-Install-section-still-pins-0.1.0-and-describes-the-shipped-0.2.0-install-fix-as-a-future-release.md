---
id: LCLI-325
title: >-
  README Install section still pins 0.1.0 and describes the shipped 0.2.0
  install fix as a future release
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-13 03:47'
updated_date: '2026-08-13 13:22'
labels:
  - bug
  - docs
  - readme
  - release
  - 'doc:stories/maintain-lore-cli-documentation-authority'
dependencies: []
documentation:
  - docs/reference/lore-cli-release-truth.md
  - docs/runbooks/release-publishing.md
  - docs/stories/maintain-lore-cli-documentation-authority.md
modified_files:
  - README.md
  - docs/runbooks/release-publishing.md
  - docs/stories/maintain-lore-cli-documentation-authority.md
priority: medium
type: bug
ordinal: 448000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The README contradicts itself on the current version, and the half a new user actually copies is the stale half.

The header and status block state `@opum-ai/lore@0.2.0` and "Status: 0.2.0 released" (README lines 22 and 28), and `package.json` is `0.2.0`. Every command in the Install section pins `0.1.0`:

- line 79  `npx @opum-ai/lore@0.1.0 --help`
- line 82  `bunx @opum-ai/lore@0.1.0 --help`
- line 85  `npm install -g @opum-ai/lore@0.1.0`
- line 90  `npm install -g --allow-scripts=@ladybugdb/core @opum-ai/lore@0.1.0`
- line 99  `bun add -d @opum-ai/lore@0.1.0   # or: npm i -D @opum-ai/lore@0.1.0`

The consequence is worse than a stale number. The surrounding prose reads "`0.1.0` declared LadybugDB as a runtime dependency, so npm versions with install-script approval may require `--allow-scripts=@ladybugdb/core`. **The next release removes that exception**" — written in the future tense about work that has already shipped. LCLI-301 (Done) removed the install-script approval requirement. So a reader following the README installs a superseded version and is walked through an install-script workaround that the current release does not need.

Both halves are wrong in the same direction: the pinned version is behind, and the prose describing the fix is written as though the fix is pending.

Worth fixing at the mechanism level as well as the instance. Pinned exact versions in prose drift silently every release and nothing currently catches it — the release runbook has no step that reconciles README install commands against `package.json`. Either stop pinning in the install examples (`npx @opum-ai/lore --help` installs latest and cannot go stale), or add a release-time check that fails when a version literal in README disagrees with `package.json`. Prefer whichever the release runbook can enforce, because an unenforced convention will drift again at 0.3.0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every install command in the README resolves to the current released version, whether by unpinning or by updating the literal
- [ ] #2 The LadybugDB install-script paragraph is rewritten in the past tense to describe the shipped 0.2.0 behaviour, and no longer instructs the reader to pass --allow-scripts for a current install
- [ ] #3 No version literal anywhere in the README disagrees with package.json
- [ ] #4 Drift is prevented rather than only corrected: either the install examples no longer pin an exact version, or a check fails when a README version literal disagrees with package.json
- [ ] #5 If a check is added, it is proven by a negative control that makes it fail and names the offending line, and its exit code is taken without a pipe
- [ ] #6 The release runbook records whichever mechanism was chosen so 0.3.0 cannot reintroduce the drift
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Couple LCLI-325 to the documentation-authority Story so Lore manages the Story/task back-reference and status rollup.
2. Remove exact @opum-ai/lore version pins from every README install command and rewrite the surrounding launcher/LadybugDB prose as shipped 0.2.0 behavior.
3. Add a release-runbook checkpoint requiring README install examples to remain versionless and the stated install behavior to match the release being cut.
4. Run Lore synchronization, strict validation/check gates, focused README version scans, the relevant test suite, and git diff hygiene; then review each acceptance criterion.
<!-- SECTION:PLAN:END -->
