---
id: LCLI-327
title: >-
  docker/e2e/run-e2e.sh writes a repo-local git identity, leaking "lore e2e
  <e2e@lore.test>" into real commits on dev
status: Done
assignee:
  - '@codex'
created_date: '2026-08-13 04:18'
updated_date: '2026-08-14 00:31'
labels:
  - bug
  - e2e
  - git
  - provenance
  - ci
dependencies: []
modified_files:
  - docker/e2e/run-e2e.sh
  - test/docker-e2e-guard.test.ts
  - docs/runbooks/docker-e2e-testing-environment.md
priority: medium
type: bug
ordinal: 450000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The E2E harness sets the git author identity with an unqualified `git config`, which writes to whichever repository is current. When the script runs anywhere other than a throwaway container checkout, that is the developer's real clone — and the identity persists in `.git/config` long after the run, silently re-authoring every subsequent commit.

Source, `docker/e2e/run-e2e.sh` Phase 1 bootstrap:

```
critical "git init" 0 -- git init -q
git config user.email "e2e@lore.test"
git config user.name  "lore e2e"
```

`git init -q` against an already-initialised repository is a harmless re-init, so it does not stop the two following lines from writing into a real clone. A second occurrence at line 1805 is correctly scoped with a subshell `cd` into a scratch directory; the Phase 1 pair is not scoped at all. Related hardening exists — LCLI-269 (Done) stopped destructive phases running against the caller's cwd — but the identity write was not covered by it.

**This has already happened and is visible in shipped history.** In this checkout:

```
git config --local  user.name/email  -> lore e2e / e2e@lore.test
git config --global user.name/email  -> Jeremy Newhouse / jeremy.newhouse@salientdata.ai
```

and of the last eight commits on `dev`, **six are authored `lore e2e <e2e@lore.test>` and two by the real author**. Commit provenance on the default branch is therefore wrong for most recent history, `git blame` and contributor records are wrong with it, and nothing warns: the local override wins over the correct global one silently, and the fake identity is plausible enough to pass a glance in `git log`.

Two independent fixes are wanted, because either alone leaves a hole.

1. **Stop producing it.** The harness must never mutate an identity it does not own — scope the config to the scratch repository the way line 1805 already does, or pass the identity per-invocation via `git -c user.name=... -c user.email=...` or the `GIT_AUTHOR_*`/`GIT_COMMITTER_*` environment variables, which cannot persist. Prefer a mechanism that is incapable of writing to `.git/config` at all, rather than one that merely aims at the right repository.
2. **Refuse to run in the wrong place.** Phase 1 should fail closed when the current repository is not the disposable E2E checkout — the same class of guard LCLI-269 added, extended to cover configuration writes and not only destructive filesystem phases.

Cleanup is a separate decision and is deliberately not assumed here: the existing local override should be removed from developer clones, but rewriting the six mis-authored commits on `dev` means a force-push to the default branch and is the maintainer's call, not an automatic consequence of this fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 run-e2e.sh cannot write user.name or user.email into any repository it does not create, verified by inspection of every git config call site in the script
- [x] #2 The Phase 1 bootstrap fails closed with a clear message when the current repository is not the disposable E2E checkout
- [x] #3 A negative control proves the guard: invoking the harness from a non-E2E repository aborts, leaves .git/config byte-identical, and names the offending path; its exit code is taken without a pipe
- [x] #4 After a full E2E run, the host repository .git/config contains no user.name or user.email written by the harness
- [x] #5 Guidance for clearing an already-leaked local override is recorded where a developer will find it
- [x] #6 A decision on whether to rewrite the six mis-authored commits on dev is recorded, with the force-push implication stated, rather than left implicit
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit every git identity/configuration call and the existing container guard.
2. Add a fail-closed bootstrap check that proves the current repository is the disposable E2E workspace, and use non-persistent per-command identity configuration for all E2E-created commits.
3. Extend host-side guard tests with a non-E2E Git repository negative control that snapshots .git/config without a pipeline.
4. Update the Docker E2E runbook with safe cleanup guidance and the no-history-rewrite decision.
5. Run focused tests and proportionate project gates; record criterion-by-criterion evidence and adversarial self-review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the LCLI-327 safety fix locally. The harness now refuses any start directory other than an empty, non-Git /workspace; it exports Git author/committer identity for child processes instead of writing git config; and the nested fixture uses the same non-persistent identity. Added a host-side negative control that initializes a caller-owned Git repo, spoofs the container marker, asserts direct exit 1, names the offending path, and compares .git/config byte-for-byte. The full Docker E2E run passed with a new final assertion that the workspace Git config has no user.name/user.email.

Verification passed: bash -n docker/e2e/run-e2e.sh; bun test test/docker-e2e-guard.test.ts (5 passing); bun run typecheck; bun run lint; bun run build; bun test (full suite); docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e (passed after final assertion); lore validate --strict; lore check --strict; git diff --check. lore sync --dry-run reports only docs/log.md.

Adversarial self-review: strengthened the initial guard from merely container-marker/path checks to reject a pre-existing Git repository and any non-empty workspace, then added an E2E assertion for non-persistence. No existing dev history was rewritten.

Blocker to completion/delivery: actual lore sync is required for the documentation workflow and automatically commits dirty backlog/ state; source/docs commits and any PR delivery also require explicit user authority.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Prevented the Docker E2E harness from persisting its test identity in repository configuration. The bootstrap now requires an empty, non-Git /workspace; author/committer identity is process-scoped; and the runbook documents local cleanup while explicitly retaining existing dev history. Verified with focused guard tests, the full Bun suite, typecheck, lint, build, strict Lore validation/check, diff hygiene, and a full Docker E2E run that asserts no local user.name/user.email remains.
<!-- SECTION:FINAL_SUMMARY:END -->
