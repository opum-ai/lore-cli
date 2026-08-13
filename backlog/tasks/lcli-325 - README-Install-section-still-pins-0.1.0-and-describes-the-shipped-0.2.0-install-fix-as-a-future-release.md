---
id: LCLI-325
title: >-
  README Install section still pins 0.1.0 and describes the shipped 0.2.0
  install fix as a future release
status: Done
assignee:
  - '@codex'
created_date: '2026-08-13 03:47'
updated_date: '2026-08-13 14:48'
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
  - docs/log.md
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
- [x] #1 Every install command in the README resolves to the current released version, whether by unpinning or by updating the literal
- [x] #2 The LadybugDB install-script paragraph is rewritten in the past tense to describe the shipped 0.2.0 behaviour, and no longer instructs the reader to pass --allow-scripts for a current install
- [x] #3 No version literal anywhere in the README disagrees with package.json
- [x] #4 Drift is prevented rather than only corrected: either the install examples no longer pin an exact version, or a check fails when a README version literal disagrees with package.json
- [x] #5 If a check is added, it is proven by a negative control that makes it fail and names the offending line, and its exit code is taken without a pipe
- [x] #6 The release runbook records whichever mechanism was chosen so 0.3.0 cannot reintroduce the drift
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Couple LCLI-325 to the documentation-authority Story so Lore manages the Story/task back-reference and status rollup.
2. Remove exact @opum-ai/lore version pins from every README install command and rewrite the surrounding launcher/LadybugDB prose as shipped 0.2.0 behavior.
3. Add a release-runbook checkpoint requiring README install examples to remain versionless and the stated install behavior to match the release being cut.
4. Run Lore synchronization, strict validation/check gates, focused README version scans, the relevant test suite, and git diff hygiene; then review each acceptance criterion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restore on 2026-08-13 paused before source implementation because `lore link stories/maintain-lore-cli-documentation-authority LCLI-325 --json` automatically created local commit `804534f13e7d83a6078fa4b6a6e8bf198080ddd3` containing the task's In Progress state, plan, documentation/modified-file metadata, and Lore back-reference. The campaign did not authorize commits. The Story frontmatter addition remains uncommitted. Required disposition: explicitly retain this local metadata commit or authorize unwinding it while preserving the task and Story changes in the working tree.

User decision on 2026-08-13: retain local Lore metadata commit `804534f13e7d83a6078fa4b6a6e8bf198080ddd3` and continue LCLI-325. Follow-up workflow defect recorded separately as LCLI-328; it is not part of doc-18.

Implemented the README/runbook correction locally: all copyable `@opum-ai/lore` install commands are versionless; current-install prose describes the shipped 0.2.0 script-free launcher; and release-publishing step 3 preserves versionless examples and reconciles current-version/install-behavior prose on future releases.

Verification before managed synchronization:
- `rg -n '@opum-ai/lore@[0-9]' README.md` returned only the correct published-status reference `@opum-ai/lore@0.2.0`.
- `rg -n '0\\.1\\.0|next release|allow-scripts=@ladybugdb/core' README.md` returned no matches (exit 1 as expected).
- `lore validate --strict --json` passed with 0 errors and 0 warnings.
- `git diff --check` passed.
- `bun test` passed: 2560 pass, 1 skip, 0 fail across 79 files.
- `lore sync --dry-run --plain` passed and would update only `docs/log.md` and `docs/stories/maintain-lore-cli-documentation-authority.md`.

Actual `lore sync` is paused pending explicit commit authority because its documented catch-all step will commit all dirty `backlog/` paths, currently including LCLI-325, follow-up LCLI-328, and campaign tracker doc-18.

Post-sync verification and adversarial self-review:
- Authorized `lore sync --json` created commit `00ae852096088f6e7df1f7b44e050a5724e2b448` containing exactly LCLI-325, LCLI-328, and tracker doc-18; it updated only the predicted Story rollup and generated log in the working tree.
- `lore validate --strict --plain`: 69 files, 0 errors, 0 warnings, 6 skipped.
- `lore check --strict --plain`: 69 files, 0 errors, 0 warnings.
- Executable Bun assertions verified every README install command is present and versionless, every exact `@opum-ai/lore@X.Y.Z` README reference equals package.json `0.2.0`, stale 0.1.0/future-tense/install-script guidance is absent, and the release-runbook anti-drift checkpoint exists.
- `git diff --check` passed.
- Adversarial self-review found no out-of-scope source/doc edits. The Lore-generated log changes contain expected previously unsynchronized documentation history.
- AC5 is satisfied as not applicable: the chosen AC4 mechanism is versionless examples, and no bespoke check was added.

All acceptance criteria are satisfied in the current working tree. LCLI-325 remains In Progress because the README/docs implementation is still uncommitted and no source-delivery commit authority has been granted.

Delivered by PR #359 to dev at merge commit `c0b94d964ba1f94b9f2d1ab55dbb1f69fb6b8790`. All eight CI jobs passed, including Ubuntu/Windows tests, browser qualification, compile/scaffold/benchmark smoke, and Docker E2E.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed stale exact version pins from README install commands, documented the shipped 0.2.0 script-free launcher behavior, and added a release-runbook checkpoint that keeps copyable installs versionless. Verified with executable release-truth assertions, 2,560 passing tests, strict Lore validation/check (69 files, 0 findings), diff hygiene, adversarial self-review, and all eight PR #359 CI jobs. Merged to dev as `c0b94d964ba1f94b9f2d1ab55dbb1f69fb6b8790`.
<!-- SECTION:FINAL_SUMMARY:END -->
