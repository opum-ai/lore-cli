---
id: LCLI-318
title: >-
  LCLI-303's `unknown workspace member <id>` validation message does not fire in
  single-member workspaces -- masked by an earlier, unrelated validation failure
status: Done
assignee:
  - '@codex'
created_date: '2026-08-05 11:57'
updated_date: '2026-08-14 11:00'
labels:
  - workspace
  - validation
  - reliability
  - 'doc:stories/build-the-persistent-local-graph-platform'
dependencies:
  - LCLI-317
references:
  - >-
    Found during the lore-test repo's v0.1.1 comprehensive E2E re-verification
    pass (branch e2e/v0.1.1-comprehensive-pass
  - >-
    not merged/pushed): see e2e_findings_v0.1.1.md section 5 (reconciliation
    note) and section 7 defect H
  - plus docs/runbooks/e2e-verification-v0.1.1.md
  - in that repo.
documentation:
  - docs/stories/build-the-persistent-local-graph-platform.md
modified_files:
  - src/core/workspace-projection.ts
  - src/core/workspace-source.ts
  - src/core/workspace-retrieval.ts
  - test/workspace-retrieval.test.ts
priority: medium
type: bug
ordinal: 441000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
LCLI-303's `unknown workspace member <id>` validation message should fire reliably whenever `--repository` names a value that isn't a declared member of the active `--workspace` manifest, regardless of how many members that manifest declares.

## Observed
During the lore-test repo's v0.1.1 comprehensive E2E re-verification pass, LCLI-303 was tested twice against the identical globally-installed `lore` v0.1.1 binary:

- **Real, two-member workspace** (`meridian`/`partner`, `lore-workspace.json`): `lore graph --workspace lore-workspace.json --repository bogus-member --json` (and the same for `query`/`context`/`path`/`impact`, 5/5 commands) returned the exact documented shape: exit 6, `error_type: "validation"`, message `workspace projection is invalid: unknown workspace member bogus-member` -- correctly interpolating the given invalid id. Survived a dedicated adversarial re-verification pass (repeated against two further unknown member names, full-stderr grep for any native/dlopen trace) with no evidence contradicting "fixed."
- **Fresh, single-member workspace** (one member, `solo`, pointing at `.`): the same command against `--repository bogus-member` returned exit 6 and `error_type: "validation"` (both correct), but the message was `workspace member solo could not be validated` -- it never names `bogus-member` anywhere in stdout or stderr. A sanity re-run against the one genuinely *valid* member (`--repository solo`) produced the byte-identical error message, proving the intended unknown-member check never actually runs in this fixture shape -- a different, earlier member-validation step fails first and masks it.

The regression (old uncaught crash + `lbugjs.node` dlopen-message leak) is confirmed gone in both cases -- this is specifically about the message contract for LCLI-303's own new validation path not firing in a single-member workspace.

## Repro
    # Two-member workspace (works correctly):
    lore graph --workspace lore-workspace.json --repository bogus-member --json
    # -> exit 6, "unknown workspace member bogus-member"

    # Single-member workspace (fails to name the bad value):
    echo '{"schemaVersion":"lore-workspace-manifest/1","workspaceId":"solo-ws","members":[{"id":"solo","path":"."}]}' > /tmp/solo-workspace.json
    cd /path/to/a/lore-init'd/dir
    lore graph --workspace /tmp/solo-workspace.json --repository bogus-member --json
    # observed: exit 6, "workspace member solo could not be validated" (doesn't mention bogus-member)
    lore graph --workspace /tmp/solo-workspace.json --repository solo --json
    # observed: byte-identical error message, even though "solo" is the one valid member

## Note
This pass's own investigation into LCLI-302 (see the companion ticket for that fix's reliability gap) found the same fresh-fixture/real-bundle split pattern, and the single-member workspace fixture above was created on the same internal-boot-volume scratch area as LCLI-302's failing fixtures -- worth checking whether the two issues share a root cause (e.g. an earlier member/native-retrieval health check throwing before the unknown-member validation gets a chance to run) before treating them as fully independent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore graph/query/context/path/impact --workspace <manifest> --repository <unknown-id> reliably returns the LCLI-303-documented `unknown workspace member <id>` validation message (exit 6, error_type validation), correctly naming the given id, regardless of how many members the workspace manifest declares
- [x] #2 Root cause identified for why a single-member workspace manifest produces a different, earlier-firing validation message that never names the actually-invalid --repository value -- including whether it shares a cause with the companion LCLI-302 reliability ticket
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a single-member regression fixture whose declared member fails source validation, then prove an unknown `--repository` selector must win before that member is loaded across graph/query/context/path/impact while the valid selector retains the member-validation error.
2. Extend workspace projection/source validation so requested member IDs are checked against the already-parsed manifest immediately before any member root, Git, Backlog, or Ladybug source work; retain the existing projection-level assertion as a defensive boundary.
3. Thread the explicit selector through both indexed and reference workspace loads without changing unselected workspace behavior, duplicate-selector handling, valid-member failures, fallback policy, or diagnostic privacy.
4. Run focused workspace tests, typecheck, lint, the full test suite, a real CLI-style single-member reproduction, diff hygiene, and an adversarial self-review against both acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation (2026-08-06 UTC): added a manifest-level selector validation boundary immediately after the explicit workspace manifest is parsed and before any member locator, Git, Backlog, source, or Ladybug work. Workspace retrieval threads the requested member IDs through both automatic/indexed and reference source loads; the existing projection-level assertion remains as a defensive check. Unselected workspaces and valid member selections keep their prior behavior.

Root cause: `loadWorkspaceRetrievalGraph` previously called `loadWorkspaceProjection` before `assertWorkspaceProjectionSelection`. `loadWorkspaceProjection` validates every declared member while building the projection, so an uninitialized or otherwise invalid sole member threw `workspace member solo could not be validated` before the unknown requested ID could be compared with the manifest. This is the same uninitialized Backlog source condition isolated by LCLI-317, but not a Ladybug/native reliability defect; LCLI-318's independent defect was validation ordering.

Verification so far:
- `bun test test/workspace-retrieval.test.ts` — 13 passed, 0 failed, 144 expectations. The new single-member regression exercises graph/query/context/path/impact, exact exit 6 validation messaging, the supplied unknown ID, zero member loads, zero native loads, and preservation of the valid-member failure path.
- `bun run typecheck` — passed.
- `bun run lint` — passed; 191 files checked, no fixes.
- `bun test` — 2,529 passed, 1 skipped, 0 failed, 8,623 expectations across 76 files. The skip is the pre-existing published-launcher qualification.
- Real external-process probe from `/private/tmp/lcli-318-repro.2KJU5a`: unknown `bogus-member` returned exit 6 with `error_type: validation` and `workspace projection is invalid: unknown workspace member bogus-member`; selecting declared `solo` continued to return `workspace member solo could not be validated`.
- `git diff --check` — passed.

One initial focused run failed only because the new test manifest omitted current required `displayName` and `expectedRef` fields; correcting the fixture to the live schema produced the passing evidence above.

Adversarial self-review (2026-08-06 UTC): no unresolved acceptance gap found.
- Manifest syntax/read errors still precede selector validation because membership cannot be trusted until schema parsing succeeds.
- Unknown selectors now precede member locator, Git-ref, Backlog/source, and native work on reference, unsupported-platform, automatic, and indexed paths.
- Valid selectors still require the complete workspace candidate; the fix does not silently skip invalid unselected members or weaken expected-ref/source validation.
- Duplicate selectors retain fail-loud behavior; unselected snapshot/runtime callers omit `selectionMemberIds` and are unchanged.
- The projection-level assertion remains, source options cannot override retrieval's selection, the same parsed manifest supplies both membership and projection, and no private member/native detail enters the unknown-member envelope.
- Exact-message coverage spans single- and two-member manifests plus graph/query/context/path/impact.

Local delivery authorization update (2026-08-06 UTC): the user approved creation of local branch `fix/lcli-318-workspace-selection-order` and one local commit containing exactly the six verified campaign paths. Push, PR creation, merge, publication, branch deletion, and unrelated cleanup remain unauthorized; LCLI-318 stays In Progress pending integration.

Remote delivery update (2026-08-06 UTC): after user approval, fetched `origin/dev` and confirmed it remained at `761f64419ef8593ae4f62d04419a39741fa41624`, so no rebase or verification rerun was required. Branch-local `bun run src/cli.ts check --json` and `git diff --check origin/dev...HEAD` passed. Pushed `fix/lcli-318-workspace-selection-order` and opened PR #333 against `dev`: https://github.com/opum-ai/lore-cli/pull/333. Live GitHub inspection confirmed exact head `a11a73e98154a783593f84bc6c52f692d11edddb`, exact base `761f64419ef8593ae4f62d04419a39741fa41624`, state OPEN / merge status BLOCKED, with all eight CI checks queued. This task-note reconciliation is local and uncommitted; merge, publication, branch deletion, and unrelated cleanup remain unauthorized. LCLI-318 stays In Progress pending final-head CI and integration.

Integration and recovery evidence (2026-08-07 UTC): GitHub's outage left pull-request run 31120842498 in a contradictory ghost state (parent queued with no rerun jobs, attempt 1 completed/failure, cancellation reporting completed, and rerun/re-request reporting already running). A manual workflow_dispatch recovery run 31132927592 qualified the unchanged exact head 9c0f93e37460fafe7e06bd029fedb7cc65a35555 with all nine jobs successful, including the additional macOS matrix leg. Because dispatch checks do not populate the PR-required rollup, PR #333 was closed and reopened without changing its branch or SHA; fresh pull_request run 31133308485 then passed all eight required checks. PR #333 merged into dev as ac6a771647340d4d171530bdbd0eb2a42e66224b. Refreshed origin/dev contains the exact PR head by ancestry, and the merge commit records 761f64419ef8593ae4f62d04419a39741fa41624 and 9c0f93e37460fafe7e06bd029fedb7cc65a35555 as its parents. No check bypass, force-push, or source amendment occurred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented manifest-first workspace selector validation so unknown repository IDs are reported before member or native loading across graph/query/context/path/impact. Verified with 13 focused tests, typecheck, lint, the full 2,529-pass suite with one pre-existing skip, a real external-process single-member probe, adversarial self-review, a nine-job exact-head recovery CI pass, and all eight required PR checks. PR #333 exact head 9c0f93e37460fafe7e06bd029fedb7cc65a35555 is integrated into dev as ac6a771647340d4d171530bdbd0eb2a42e66224b.
<!-- SECTION:FINAL_SUMMARY:END -->
