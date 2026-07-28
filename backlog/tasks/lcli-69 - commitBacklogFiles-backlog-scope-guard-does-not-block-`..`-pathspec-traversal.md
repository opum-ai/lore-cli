---
id: LCLI-69
title: commitBacklogFiles backlog/ scope guard does not block `..` pathspec traversal
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The backlog/ containment guard in commitBacklogFiles is a plain `startsWith("backlog/")` string check, not real path containment. A pathspec like `backlog/../docs/secret.md` passes the guard and git resolves/commits/stages it outside backlog/, breaking the sole-committer invariant recorded in ADR-0012. Confirmed live against real git (`git add -- ':(literal)backlog/../docs/secret.md'` resolves and commits the outside file).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 commitBacklogFiles rejects any candidate path whose resolved (normalized) form falls outside backlog/, not just ones failing a string-prefix check
- [x] #2 A regression test exercises a `..`-containing path and asserts it is rejected rather than committed
- [x] #3 The guard doc comment accurately describes what is defended against
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed by normalizing each candidate path (node:path posix.normalize) before the
backlog/ prefix check in commitBacklogFiles (src/state.ts), and using the
NORMALIZED path — not the raw one — for the actual git status/add/commit calls
downstream, since validating a copy while shelling out the raw string would
leave the traversal exploitable. Rejects on posix.isAbsolute(normalized) or
!normalized.startsWith("backlog/").

Verified:
- Live pre-fix repro against real git in a scratch temp repo reproduced the
  task's own finding exactly: commitBacklogFiles(["backlog/../docs/secret.md"])
  committed the outside file (confirmed via git stash on src/state.ts + rerun).
  Post-fix it throws LoreError("drift") before any git call, HEAD unmoved,
  outside file remains untracked.
- 6 new tests added to test/state.test.ts: 5 fake-GitSpawn traversal variants
  (task's own repro, `backlog/./../`, `backlog//../`, deeper `../../` climb,
  absolute `/etc/passwd`) all reject before reaching git; a sibling-prefix
  case (`backlog-evil/x.md`, no `..` involved) still correctly rejected,
  proving the pre-existing trailing-slash protection wasn't regressed; a
  redundant `./` segment (`backlog/./tasks/x.md`) is accepted and the
  NORMALIZED form is what's actually passed to git status (asserted on argv);
  one real-git integration regression test reproduces the task's exact repro
  end-to-end.
- All 6 new tests confirmed to FAIL against the pre-fix code (git stash
  src/state.ts, rerun, git stash pop) — genuine regression guards, not
  coincidentally passing.
- Adversarial extra (not in AC, per campaign convention of testing beyond the
  literal repro on security tasks): planted a symlink inside backlog/
  pointing outside the repo (`backlog/evil-link -> ../secret-outside`) in a
  scratch repo and drove commitBacklogFiles directly. Result: committing
  `backlog/evil-link` itself just commits the symlink object (a path
  genuinely under backlog/, containing only the link-target string, not the
  target's file content) — git does not traverse through it. Committing
  `backlog/evil-link/data.txt` is a no-op (git status doesn't report it as
  dirty through an untracked symlinked directory). No escape found via this
  vector; it's a different risk class (a symlink artifact landing under
  backlog/) that this guard's contract does not cover and the task's AC
  doesn't ask for.
- Full suite: `bun test` 1526 pass / 0 fail across 45 files.
  `bun run typecheck` clean. `bunx biome check` clean (post auto-format).

INDEPENDENT REVIEW FINDING (blocking, fixed before merge):
The adversarial review found a genuine, real bypass of the initial fix: an
embedded NUL byte. posix.normalize("backlog/.." + "\0" + "/x") does NOT
collapse the ".. \0" segment as a ".." traversal (a segment containing a NUL
is not string-equal to ".."), so the value passes normalize unchanged and
still starts with "backlog/" — but Bun.spawn's argv is a NUL-terminated C
string, silently truncated at that same NUL when it crosses into the real
`git` process. Git only ever receives ":(literal)backlog/..", which resolves
to the repo root. Confirmed live end-to-end against the real
commitBacklogFiles/bunGitSpawn with full argv tracing: an unrelated in-flight
edit sitting dirty at the repo root got committed. This breaks BOTH ADR-0012
invariants at once (commits outside backlog/, sweeps an unrelated in-flight
edit into a lore-authored commit).

FIX: (1) reject any candidate path containing a NUL byte outright, before
normalize ever runs (src/state.ts, commitBacklogFiles's guard loop). (2)
Defense-in-depth per the reviewer's recommendation: porcelainPaths itself now
re-validates every path git status reports back against BACKLOG_DIR before
it's used in add/commit — closes the whole "validate one value, use a
different value downstream" bug class at the actual git-boundary choke point,
not just this one NUL instance.

3 new regression tests added: the NUL-byte payload rejected pre-git-call
(fake spawn), the same payload against real git end-to-end (proves the
exploit and the fix, matching the reviewer's own repro), and a fake-spawn
test proving porcelainPaths' own defense-in-depth layer fires if git ever
reports an out-of-scope path. Confirmed via git stash (isolating the fix
delta) that all 3 fail pre-fix (one shows the literal unsafe `git add --
:(literal)docs/escaped-somehow.md` call, one shows the promise resolving
instead of rejecting) and pass post-fix.

Also verified by the reviewer (not exploitable, no fix needed): a symlink
planted inside backlog/ — git refuses to traverse a pathspec through a
symlink ("fatal: pathspec '...' is beyond a symbolic link"), confirmed live.

Flagged, NOT fixed in this task (documented as a follow-up candidate, not
currently reachable via any real caller): posix.normalize is POSIX-only —
win32.normalize of the same string resolves differently (backslash-separator
semantics), and this repo does ship a Windows build/CI matrix. Currently
blocked in practice because Backlog's own sanitizeFilename already strips
both `/` and `\` from title-derived filenames, so no current caller can
actually construct a backslash-bearing payload — same incidental-protection
caveat as the NUL finding, worth a dedicated follow-up rather than silently
ignoring or silently expanding this task's scope.

Full bun test after the review fix: 1529 pass/0 fail (up from 1526).
bun run typecheck clean. bunx biome check clean.
<!-- SECTION:NOTES:END -->
