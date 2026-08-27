---
id: LCLI-333
title: Release Lore with Quest as the default tracker backend
status: To Do
assignee:
  - '@lore-cli'
created_date: '2026-08-14 18:09'
updated_date: '2026-08-27 16:20'
labels:
  - release
  - quest
  - tracker
  - default-backend
  - 'doc:stories/track-lore-cli-tracker-backend-integration'
dependencies:
  - LCLI-315.4
  - LCLI-332
documentation:
  - docs/stories/track-lore-cli-tracker-backend-integration.md
priority: high
type: task
ordinal: 456000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the Lore release that makes Quest the explicit default for new bundles after @opum-ai/quest is publicly available and LCLI-315.4 passes. Existing tracker choices and zero-config Backlog bundles must retain the approved migration-or-pin behavior. Publication remains a separate owner-authorized action.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The release version follows Lore semver policy and depends on a verified public Quest version
- [ ] #2 New-bundle, legacy Backlog, explicit Backlog, explicit Jira, missing Quest, incompatible Quest, migration, and pinning clean-install tests pass against immutable artifacts
- [ ] #3 Published manifests, documentation, and package metadata agree on Quest as the new-bundle default without rewriting existing explicit configuration
- [ ] #4 Publication occurs only with explicit owner authorization and immutable release evidence is recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Ground release dependencies and public Quest availability. 2. Identify the next candidate version and package contents from the exact Wave A tree. 3. Record immutable local qualification evidence only. 4. Do not publish without later exact Controller release gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave A qualification grounding: package version is 0.3.2; public npm @opum-ai/quest reports 0.1.0, while Lore’s completed LCLI-315.4 qualification is for Quest 0.2.7. Publication is therefore blocked pending a verified public compatible Quest version and later exact Controller release gate. No npm publish was attempted.

Evidence-only reconciliation (FMC correlation 880647c950004e31b7e0ea4634bb9f51, dev bd6a31cc58a90678d45144fb3b171c43262ca016): prior grounding updated. Package family now aligned at 0.3.3 and an installable publish-ready candidate exists from corrected source a4322b71df3afaa94e1d1065934513dd34683fa6 (staged /tmp/lore-0.3.3-family-a4322b7, manifest v1 sha256 745628def534bd76375916c9b3ca57ecf967e3b2000ed5edb6047e959ebbc746, root tgz sha256 f197af302548ef8dd42613107076757e0f214fdf9edb0c9edf4d76bab7ea9686); pinned-runtime gates green (2662 pass / 0 fail / 1 skip, strict lore check+validate clean, fresh-prefix install smoke). Subtask settlement state: LCLI-333.1 Done (tracker-persistence/cutover/archive modules delivered); old release-metadata fix work landed as LCLI-350 (Done) and candidate metadata as LCLI-351 (Done) after campaign renumbering. AC#1 clause breakdown against live facts: qualified LOCAL Quest artifact is 0.2.7 but PUBLIC npm @opum-ai/quest shows only 0.1.0, so 'verified public compatible Quest version' is still UNMET; @opum-ai/lore public latest remains 0.3.2, 0.3.3 intentionally unpublished. EXACT MISSING GATES for any status change: (a) ODOC-63.7 operator decision supplying npmjs credential with @opum-ai publish rights (npm E401 external gate), (b) publication of qualified Quest >=0.2.7 to public registry or an owner-approved equivalence decision, (c) qualified tag + Release workflow artifact evidence + registry verification + clean-install publication chain per docs/reference/lore-cli-release-truth.md. Status stays To Do until all three resolve; no npm operation attempted.

RC publication gate invoked per recorded direct-user order (FMC correlation 960b5e3be42042628512c1e3e5e7d771, Controller opum-doc): the 0.3.3 candidate family (source a4322b71df3afaa94e1d1065934513dd34683fa6, manifest sha256 745628def534bd76375916c9b3ca57ecf967e3b2000ed5edb6047e959ebbc746) is authorized for interactive npm publication under the rc dist-tag only (latest/main/production forbidden). Registry publication evidence will be appended to this task after the publish; the Quest public-version blocker in AC#1 is unaffected and this task remains open.

Publication FAIL-CLOSED (2026-08-27): first npm publish of @opum-ai/lore-darwin-arm64@0.3.3 (tag rc) returned EOTP web-auth challenge; the single permitted bounded --auth-type=web window closed without browser completion per procedure. No further attempts made. Partial-state proof: all seven @opum-ai packages still lack 0.3.3, latest=0.3.2 unchanged on every package, no rc dist-tag exists anywhere. Next decision (human): complete a live browser auth window for the npm CLI, or supply/confirm the credential path out-of-band; then the publication resumes with the remaining single-attempt budget honored per package.

Second publication FAIL-CLOSED (2026-08-27, GO 4ce89247 for 54b94e68): npm publish of darwin-arm64@0.3.3 (tag rc) still challenges for web auth despite operator-reported authentication; the single bounded --auth-type=web window of this execution closed without completion. Registry proof: 0.3.3-present=0, rc-tag-present=0. Diagnosis: the CLI's ambient npm credential does not carry @opum-ai publish rights (or its web step-up needs a live browser session during the window). Remedy: operator completes the web-auth URL in a browser while a window is open, or runs the recorded §4 publish sequence from their own authenticated terminal, or installs a publish-scoped token for the CLI.
<!-- SECTION:NOTES:END -->
