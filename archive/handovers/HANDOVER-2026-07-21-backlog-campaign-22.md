# Handover — seventh backlog campaign session, cursor at LORE-92 (item 3 of 8)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 2e2e739`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 1 commit ahead of `origin/dev` (this session's archive commit — push it first thing) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-92 — `lore scaffold --force`'s `writeAllOrRollback` (src/commands/
fswrite.ts) has a narrow TOCTOU window: `assertNoSymlinkInPath` runs, then several
syscalls later (`existsSync`/`readFileSync`/`writeFileOverwriting`, currently around
fswrite.ts:337-352 — RE-VERIFY, these line numbers already shifted once this session
because LORE-94 added ~18 lines to this same file) a plain `writeFileSync` performs
the actual overwrite with no re-check. A symlink planted at the target in that window
is followed, not refused. This is item 3 of the 8-item queue (LORE-90/94/92/95/89/88/
91/93) confirmed by the user on 2026-07-21 ("Risk-ascending, sweep last
(Recommended)"); do not re-ask before taking the next item.

Read the task itself first (`backlog task view LORE-92 --plain`) — do not trust this
summary alone; re-verify line numbers and the repro fresh against current dev HEAD
before implementing, per this campaign's standing discipline (this file just moved
once this session already — LORE-94 landed and shifted fswrite.ts's own line numbers
by ~18 lines; never assume a filing task's cited line numbers still hold).

Context already confirmed by the filing session (re-verify, don't just trust):
this exact gap was identified and explicitly DEFERRED during LORE-76 itself
(documented in that task's own Implementation Notes) — not a regression LORE-76
introduced. The non-force path (`createIfAbsent`'s `wx` flag = `O_CREAT|O_EXCL`) is
independently TOCTOU-safe by POSIX semantics and is NOT in scope here — only the
`--force` overwrite branch is affected. Practical severity is low (needs a concurrent
co-located attacker process racing a few-syscall window; lore's threat model is a
local single-user CLI) but the task's own AC#1 asks for the same guarantee the
non-force path already has.

Likely fix shape (verify before implementing, don't assume): Node's `writeFileSync`
accepts a numeric `flag` built from `fs.constants` instead of a string mode — passing
`O_WRONLY | O_TRUNC | O_NOFOLLOW` (composed with `O_CREAT` only for the "file doesn't
exist yet" branch) would make the open() itself fail with `ELOOP` if the final
component is a symlink, closing the window atomically instead of re-checking-then-
still-racing. This is a genuinely fresh design decision — no precedent for an
`O_NOFOLLOW`-flag write anywhere else in this codebase (grep to confirm before
assuming); don't force-fit `assertNoSymlinkInPath`'s check-then-act pattern into a
place a single flag-based open() could close atomically instead.

AC#2 needs a test that plants the symlink AFTER the existing guard has already
passed — not before (the existing LORE-76 tests only cover symlink-planted-before,
which is a different scenario already covered). The filing task's own Description
says it reproduced this deterministically by importing the real
`assertNoSymlinkInPath`/`writeFileOverwriting` exports directly and driving them in
`writeAllOrRollback`'s own order — that's a good pattern for the regression test too,
or drive it through the real `runScaffold`/consumer-scaffold command surface if that's
more natural; check `test/consumer-scaffold.test.ts`'s existing "never-silent-clobber"
test block (AC#3 says it must keep passing unchanged) for the established test style
first.

Merge gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. Run the lifecycle's step 6 independent review (general-purpose
subagent) AFTER committing the fix+tests, THEN write the outcome into the tracker —
this ordering discipline has held cleanly across every session since LORE-74 (most
recently LORE-94); don't regress on it. This session's own review caught a malformed
`backlog task edit --ac` invocation (the correct flag is `--check-ac <index>`, not
`--ac <index:checked>` — that syntax silently APPENDS bogus AC rows instead of
checking existing ones) — use `--check-ac`/`--remove-ac`/`--uncheck-ac` directly, never
guess `--ac` syntax for checking.

After LORE-92: advance cursor to LORE-95, then LORE-89, LORE-88, LORE-91, LORE-93 in
that confirmed order.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (LORE-94 moved to Resolved as row #29, Cursor → LORE-92, Queue renumbered to 6 remaining items, session-log entry appended for session 30) |
| Queue | 6 tasks remaining, all `To Do`, all `bug` type: LORE-92/95/89/88/91/93 |
| Resolved this session | LORE-94 — see Resolved table row 29 for full evidence summary |
| Branch | `dev`, clean except pre-existing untracked dirs, 1 commit ahead of `origin/dev` (`2e2e739`, this session's archive commit) — **push this before doing anything else next session** |
| Leftover branches/PRs | none — `feature/LORE-94` was merged (PR #85, `gh pr merge --rebase --delete-branch`) and pruned both remotely and locally (`gh` did this automatically as part of the merge; confirmed via `git branch -a` and `git fetch --prune`) |
| Not queued | LORE-42/43/44/45 (deferred by recorded product decisions, unchanged) plus the accumulated independent-review follow-up candidates from sessions 9-30 (see tracker's Not-queued section) |

## Next steps

1. **First action of the next session**: `git push origin dev` — this session's archive commit (`2e2e739`) is local-only, R5's own push step was deferred to the handover since the archive commit came after the PR merge sync.
2. Run the per-issue lifecycle on **LORE-92** (`writeAllOrRollback --force` TOCTOU symlink window): branch `feature/LORE-92` off `dev`, read the task's AC (`backlog task view LORE-92 --plain`), re-verify the gap fresh against current `src/commands/fswrite.ts` (line numbers WILL have drifted — LORE-94 already shifted this same file by ~18 lines this session), implement the fix (AC#1), add a symlink-planted-after-the-guard regression test (AC#2), confirm the existing rollback tests in `test/consumer-scaffold.test.ts` still pass unchanged (AC#3), verify, review, commit fix+tests, run independent review, THEN update the tracker with the outcome, PR, self-merge, prune.
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch (per the skill's step 4) — advance cursor to LORE-95 — but only AFTER the independent review completes, filling in its real outcome.
4. Continue the confirmed queue order: LORE-95 → LORE-89 → LORE-88 → LORE-91 → LORE-93.

## Critical context / traps

- **This session's archive commit is unpushed** — `git status` shows `dev` 1 ahead of `origin/dev`. Push it as literally the first action next session, before starting LORE-92's lifecycle (step 0's preflight `git pull --ff-only` would otherwise be pulling into a branch that's ahead, not behind — that's fine/a no-op, but don't skip confirming the push actually happened).
- **Line numbers drift across sessions in files multiple queued issues touch** — LORE-94 added ~18 lines to `src/commands/fswrite.ts` (the new `findSymlinkSegment` helper + its docstring), so LORE-92's own filing-time line citations (322-337) are now off by that much. This is exactly the scenario this campaign's standing "re-verify before implementing" discipline exists for — don't skip it just because the citation looks precise.
- **`gh pr merge --rebase --delete-branch` also auto-checks-out and fast-forwards the local base branch** when you were on the just-merged PR branch — confirmed this session (`git checkout dev` after the merge reported "Already on 'dev'", already fast-forwarded). Don't assume you need to manually `git checkout dev && git pull` after `gh pr merge`; verify with `git log`/`git status` first, since doing it anyway is harmless but redundant.
- **`backlog task edit`'s AC-checking flag is `--check-ac <index>`, not `--ac <index:checked>`** — the latter is a different flag (`--ac <criteria>`, ADDS a new acceptance criterion with that literal text) and silently appends bogus rows instead of checking existing ones. This session's own independent review caught exactly this mistake (4 bogus AC rows appended to LORE-94, fixed via `--remove-ac`/`--check-ac`). Always run `backlog task edit --help` first if unsure, per this project's CLAUDE.md instruction to check help before unfamiliar commands — don't guess flag names for anything that mutates Backlog data.
- **`.repro-scratch/` keeps accumulating scratch files** from every review/verification session (this session added `lore94-symlink-verify.ts`, left in place per this campaign's standing convention) — still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- **Archive handover naming**: `archive/handovers/HANDOVER-2026-07-21-backlog-campaign.md` through `-20` already existed — this session's archive used suffix `-21`. Check `ls archive/handovers/` fresh each time rather than assuming the next available number; today's date has accumulated a very high session count.
- When live-CLI-verifying against a scratch repo, write a throwaway script under `.repro-scratch/` that imports directly from `../src/...` and invoke it with `bun run .repro-scratch/<script>.ts` from the repo root — this session did this again (see `lore94-symlink-verify.ts`) and it continues to work cleanly. For a fix touching two files where you want a real pre/post comparison, `git stash push -- <file1> <file2>` then rerun the script, then `git stash pop`, is a clean way to prove a repro is real (not synthetic) without a second scratch checkout — this session used exactly that pattern for LORE-94.
- Repro scripts with relative `src/` imports must live inside the repo (e.g. under `.repro-scratch/`), not scratchpad/`/tmp` — import resolution breaks otherwise (recurred across multiple prior sessions; held again this session).
- No exported `parse*Args` function exists anywhere in this codebase — every command's argument-parsing function is private and tested only via full CLI/command-runner integration tests. Don't export one just to unit-test a fix in isolation.
- Two files in `.claude/handovers/` — `HANDOVER-2026-07-21T105420Z.md` and `HANDOVER-2026-07-21T130922Z.md` — use a different (ISO-timestamp) naming convention and are NOT part of this campaign's topic; they appear to be artifacts of a separate, unrelated session-recovery mechanism. Leave them alone; this skill's archive step only ever touches its own `-backlog-campaign` topic file.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all 30 campaign sessions to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a destructive/security fix is correct — run the real CLI against a scratch repo too, and where two files are involved in the fix, use `git stash`/`stash pop` to get a genuine pre/post comparison from the SAME repro script rather than trusting the test suite's green run alone (this session did this for LORE-94's symlink-deletion behavior).
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check.
- Don't assume a task's own filed repro is still an open gap without live-CLI-verifying it first — this campaign's single highest-value discipline; apply it to LORE-92 even though the filing session already did a first-pass verification.
- Don't re-derive a security/correctness-sensitive check from scratch when an existing, already-tested one fits — LORE-94 reused `fswrite.ts`'s `assertNoSymlinkInPath` (extracted into a non-throwing sibling) instead of writing a new symlink check; check whether LORE-92's fix can similarly build on existing precedent (though the filing task's own hint points toward a flag-based `open()` fix, which has no direct precedent in this codebase yet — verify that's genuinely the right shape before assuming, per the task's own framing).
- Don't write a tracker Resolved-row or session-log entry that asserts a review outcome before the review has actually run — draft it once, after the review completes, with the real verdict.
- Don't export a private `parse*Args` function just to unit-test a fix in isolation — no precedent for this anywhere in the codebase; stick to CLI-level integration tests like every other command.
- Don't guess a `backlog task edit` flag name for anything that mutates Backlog data — run `backlog task edit --help` first. `--ac` and `--check-ac` look similar but do very different things (add vs. check).
