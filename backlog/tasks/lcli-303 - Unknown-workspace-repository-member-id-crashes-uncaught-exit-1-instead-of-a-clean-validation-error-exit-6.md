---
id: LCLI-303
title: >-
  Unknown --workspace --repository member id crashes uncaught (exit 1) instead
  of a clean validation error (exit 6)
status: To Do
assignee: []
created_date: '2026-08-04 07:26'
labels:
  - workspace
  - error-handling
  - ladybugdb
dependencies: []
references:
  - >-
    Found during the lore-test repo's v0.1.0 comprehensive E2E pass (branch
    e2e/v0.1.0-comprehensive-pass
  - >-
    not merged/pushed): see e2e_findings_v2.md and
    docs/runbooks/e2e-verification-v0.1.0.md in that repo.
priority: medium
type: bug
ordinal: 416000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Per `workspace-projection.ts`'s `invalidWorkspace()`, an unknown `--repository <memberId>` under an explicit `--workspace` manifest should fail as a clean validation error, exit 6.

## Observed
Instead, every one of graph/query/context/path/impact crashes uncaught (exit 1, `error_type: uncaught`) with a raw native `@ladybugdb` dlopen failure message when given an unknown `--repository` member id. 100% reproducible across all 5 commands; does not occur for any valid member selection. Almost certainly enabled by LCLI-302 (native LadybugDB backend never activates in the compiled binary), but the validation code path for an unknown member apparently lacks whatever fallback the valid-member paths have, letting an internal native failure escape as an uncaught crash for what should be a cheap, early usage-style validation check.

## Repro
cd into a bundle with a lore-workspace.json, then:

    lore graph --workspace lore-workspace.json --repository bogus-member --json

Expected: exit 6, error_type validation, message names the unknown workspace member.
Actual: exit 1, error_type uncaught, native dlopen failure message (lbugjs.node not found).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Unknown --repository member id under --workspace returns exit 6 / error_type validation, not an uncaught crash, for graph/query/context/path/impact
- [ ] #2 Verify the fix holds regardless of whether the native LadybugDB backend is active or falling back (don't couple to LCLI-302)
<!-- AC:END -->
