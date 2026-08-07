---
id: LCLI-315.2
title: Add a JIRA Cloud tracker adapter
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 21:49'
updated_date: '2026-08-07 19:56'
labels: []
dependencies:
  - LCLI-315.1
documentation:
  - docs/reference/backlog-cli-contract.md
parent_task_id: LCLI-315
priority: medium
type: feature
ordinal: 436000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement JIRA Cloud as the second tracker backend behind the seam from LCLI-315.1.

Transport and auth. Lore invokes the installed @salient-ai/jira-cli executable as a subprocess from the project root and consumes its JSON success/error envelopes. jira-cli is the sole owner of Jira Cloud transport, profiles, credentials, timeouts, and Markdown/ADF conversion. Lore must not read, copy, persist, or independently source Jira credentials and must not call Jira REST directly. The project prerequisite is an installed jira command and a successful jira init; an optional non-secret profile name may be passed through as --profile. Missing, uninitialized, or incompatible CLI capability fails loud with an actionable jira init hint.

Non-secret settings (project, board, issue type, default labels, status flow, and optional jira-cli profile) belong in a [tracker.jira] table in .lore/config.toml. Backend selection and the init wizard remain owned by LCLI-315.3.

Field mapping is the substance of this task, and losses must be surfaced rather than resolved silently. Derive the real field set from BacklogTask and BacklogTaskDetail and map each field, classifying every one as native, coerced, folded, or lost. Known hard cases include modified files and ordinal ranking having no Jira equivalent, Jira having one assignee, vocabulary mismatches failing loud, and narrative fields folding into a managed Markdown description region.

Jira status writes are constrained by the project transition graph. editTask can legitimately fail where Backlog status editing succeeds; surface that as a typed LoreError with an actionable diagnostic.

Fail loud on jira-cli rate-limit and timeout errors without retrying silently.

Live qualification on 2026-08-07 used the disposable JIRA Test project JT after jira init --yes: project and metadata reads succeeded; JT-2 was created, read, updated, commented on, transitioned to In Progress, rejected an invalid priority with status 400, deleted, and confirmed absent with status 404.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 createTrackerAdapter returns a working Jira backend backed by the installed jira CLI when the tracker backend is set to jira
- [x] #2 The full adapter interface is implemented, including probe and statusFlow
- [x] #3 jira-cli is the sole owner of credentials and transport; Lore reads no Jira credential and a missing or uninitialized CLI fails loud with a jira init hint
- [x] #4 Every task field is classified as native, coerced, folded, or lost, and the classification is documented in a reference doc
- [x] #5 A type or priority value outside the Jira project vocabulary fails loud instead of being silently coerced
- [x] #6 Markdown descriptions round-trip through jira-cli, with mocked subprocess tests over the Markdown Lore emits and live qualification evidence
- [x] #7 A status write rejected by the Jira transition graph produces a typed LoreError with an actionable hint
- [x] #8 Rate-limit and timeout errors from jira-cli fail loud with a typed error and no silent retry
- [x] #9 Automated tests use a mocked jira subprocess and require no live Jira credentials
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Project only non-secret [tracker.jira] settings. 2. Construct a Jira TrackerAdapter that shells the installed jira-cli through an injectable subprocess seam. 3. Validate live project type and priority vocabularies during probe. 4. Map the complete task model and fold unsupported narrative fields into a managed Markdown metadata region. 5. Map CLI errors and transition-graph rejection to typed LoreError values without retries. 6. Verify with mocked subprocess tests, live disposable JT issues, Lore gates, the full test suite, typecheck, lint, and build.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User decision 2026-08-07 supersedes the original direct-fetch design: shell the installed @salient-ai/jira-cli, require jira init, and leave credentials entirely owned by jira-cli. Live JT qualification created and deleted JT-2 successfully.

Verification passed: 73 focused tests; full npm test; npm run typecheck; npm run lint; npm run build; lore sync; lore validate --strict; lore check --strict; git diff --check. Live JT qualification created/updated/commented/transitioned/deleted JT-2 and confirmed invalid-priority/404 behavior. A second disposable JT-3 proved the managed Markdown plus JSON region round-trips byte-for-byte through jira-cli/ADF and was deleted.

Delivery completed through PR #339. GitHub Actions run 31213072954 passed all eight jobs on exact head 9ebfca9f0268f2f0448ee92eef42730cfc4dd205. PR #339 merged into dev as 9b556fbaa330b41771f5619bdc8a41a0594268d4; merged ancestry was verified before deleting the exact local and remote feat/lcli-315-2-jira-cloud-adapter refs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the Jira Cloud tracker backend as a subprocess adapter over @salient-ai/jira-cli, keeping credentials, HTTP, timeouts, and ADF conversion entirely CLI-owned. Added non-secret tracker config, complete native/coerced/folded/lost field mapping, managed narrative metadata, typed vocabulary/transition/rate-limit/timeout failures, mocked full-interface tests, scaffold guidance, and reference documentation. All automated and Lore gates passed, with disposable JT live qualification cleaned up.
<!-- SECTION:FINAL_SUMMARY:END -->
