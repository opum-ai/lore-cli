---
id: LCLI-318
title: >-
  LCLI-303's `unknown workspace member <id>` validation message does not fire in
  single-member workspaces -- masked by an earlier, unrelated validation failure
status: To Do
assignee: []
created_date: '2026-08-05 11:57'
labels:
  - workspace
  - validation
  - reliability
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
- [ ] #1 lore graph/query/context/path/impact --workspace <manifest> --repository <unknown-id> reliably returns the LCLI-303-documented `unknown workspace member <id>` validation message (exit 6, error_type validation), correctly naming the given id, regardless of how many members the workspace manifest declares
- [ ] #2 Root cause identified for why a single-member workspace manifest produces a different, earlier-firing validation message that never names the actually-invalid --repository value -- including whether it shares a cause with the companion LCLI-302 reliability ticket
<!-- AC:END -->
