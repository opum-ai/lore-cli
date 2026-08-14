---
id: LCLI-327
title: >-
  docker/e2e/run-e2e.sh writes a repo-local git identity, leaking "lore e2e
  <e2e@lore.test>" into real commits on dev
status: To Do
assignee: []
created_date: '2026-08-13 04:18'
updated_date: '2026-08-14 11:00'
labels:
  - bug
  - e2e
  - git
  - provenance
  - ci
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
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
- [ ] #1 run-e2e.sh cannot write user.name or user.email into any repository it does not create, verified by inspection of every git config call site in the script
- [ ] #2 The Phase 1 bootstrap fails closed with a clear message when the current repository is not the disposable E2E checkout
- [ ] #3 A negative control proves the guard: invoking the harness from a non-E2E repository aborts, leaves .git/config byte-identical, and names the offending path; its exit code is taken without a pipe
- [ ] #4 After a full E2E run, the host repository .git/config contains no user.name or user.email written by the harness
- [ ] #5 Guidance for clearing an already-leaked local override is recorded where a developer will find it
- [ ] #6 A decision on whether to rewrite the six mis-authored commits on dev is recorded, with the force-push implication stated, rather than left implicit
<!-- AC:END -->
