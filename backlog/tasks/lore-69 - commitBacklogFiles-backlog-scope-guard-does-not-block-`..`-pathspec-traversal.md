---
id: LORE-69
title: commitBacklogFiles backlog/ scope guard does not block `..` pathspec traversal
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 11:00'
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
<!-- SECTION:NOTES:END -->
