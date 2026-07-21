# Handover — ninth backlog campaign session, cursor at LORE-89 (item 5 of 8)

**Date**: 2026-07-21 | **Grounded against**: `dev @ ea414c0`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 1 commit ahead of `origin/dev` (this session's archive commit — push it first thing) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-89 — src/commands/check.ts's own concept-scan path
(`tryConceptsForBundle`, currently check.ts:264-281, called from runCheck at
check.ts:147) discovers/parses `tasks:`-linked concepts via its own
`walkFiles`+`parseConcept` path, entirely separate from `core/bundle.ts`'s
`loadBundle` (which LORE-84 already fixed to thread a project's
`.lore/profile.toml` through). check.ts imports nothing from `core/profile.ts`
— no `loadProfile`, no `Profile` type anywhere — and its one
`parseConcept(file.path, file.raw)` call at check.ts:273 passes no
`options.profile`, so it always validates against the built-in default
profile, never a project's custom one. This is item 5 of the 8-item queue
(LORE-90/94/92/95/89/88/91/93) confirmed by the user on 2026-07-21
("Risk-ascending, sweep last (Recommended)"); do not re-ask before taking the
next item.

Read the task itself first (`backlog task view LORE-89 --plain`) — do not
trust this summary alone; re-verify line numbers and the live repro fresh
against current dev HEAD before implementing. Line numbers in check.ts had
NOT drifted as of this handover (matched the filing task's own citations
exactly), but two of the last three sessions found drift in whatever file
they touched — never assume it still holds.

The filing task's own live repro (re-verify fresh, don't trust as still
true): a scratch bundle with `.lore/profile.toml` redefining the built-in
`Story` type to require an extra `owner` field, plus a `tasks:`-linked doc
declaring `type: Story` that satisfies the DEFAULT Story schema but omits the
custom-required `owner`. `lore check` reports "0 errors, 0 warnings" for that
file (silently wrong), while `lore query`/`lore validate`/`lore sync` all
correctly reject it with an "owner: Invalid input" validation error, exit 6.
This three-way disagreement is the actual bug: ADR-0007 documents `lore
check` as the trustworthy, authoritative CI gate specifically so `validate`/
`check` never silently diverge — right now they do, for exactly the class of
drift the gate exists to catch.

Precedent to follow (LORE-84, the prior "thread the profile through" task,
already updated 9 loadBundle callers with this exact pattern — read that
task/PR's diff for the established shape before designing something new):
1. `runCheck` needs to `loadProfile({ root: options.root })` once (mirroring
   how `context.ts`/`graph.ts`/etc. already do it per LORE-84) and forward it
   into `tryConceptsForBundle`, which forwards it into
   `parseConcept(file.path, file.raw, { profile })`.
2. OPEN QUESTION to resolve before implementing, not already decided: `lore
   check` supports multiple bundle ROOTS (`--external`/multi-path — see
   `collectBundles(options.root, parsed.paths, advisories)` at check.ts:136,
   and `tryConceptsForBundle` is called once per `Bundle` via
   `bundles.map(tryConceptsForBundle)` at check.ts:147). Is `.lore/profile.toml`
   always resolved against the single top-level `options.root` regardless of
   how many bundle directories are scanned within that same repo, or could a
   `Bundle`'s own `root` differ from `options.root` in some check.ts scenario
   (genuinely different repos, not just different bundle sub-directories)?
   Check how `core/bundle.ts`'s own `Bundle` type defines `root`, and how
   LORE-84's own multi-bundle callers (if any) handled this, before assuming
   a single top-level `loadProfile` call is correct for every case check.ts
   supports.
3. `error`-swallowing symmetry: `tryConceptsForBundle` already isolates one
   root's `parseConcept` throw into `result.error` rather than aborting the
   whole scan (LORE-27 round 9's own fix, documented right above the
   function) — a validation LoreError from a NOW-profile-aware `parseConcept`
   must flow through that exact same isolation path, not bypass it.

AC#2/AC#3/AC#4 all hinge on one thing: after the fix, `lore check` and `lore
validate`/`query`/`sync` must agree on the SAME file (both reject the
custom-required-field violation, both accept a conforming one) — the task's
own framing is "close the three-way disagreement," not "add validation from
scratch." AC#4 explicitly wants a test at check.ts's OWN command-layer scan
(not just core/bundle.ts's loadBundle in isolation, which LORE-84 already
covers) — check test/check.test.ts for where profile-adjacent tests
currently live, if any, before deciding where to add this.

Merge gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. Run the lifecycle's step 6 independent review (general-
purpose subagent) AFTER committing the fix+tests, THEN write the outcome into
the tracker. Budget real time for a possible second implementation round —
LORE-92's review found genuine blocking defects (session 31), and this
task's own "which root does the profile come from" open question is exactly
the kind of thing a careful reviewer might catch if the first implementation
guesses wrong.

After LORE-89: advance cursor to LORE-88, then LORE-91, LORE-93 in that
confirmed order. LORE-88 is closely related (same "thread the profile
through" pattern, applied to `rewriteInbound`'s `serializeConcept`
re-serialize path instead of a parse path) — read LORE-89's own resolution
notes before starting LORE-88 next session, since the same design questions
(which root, how to avoid re-deriving what LORE-84/LORE-89 already solved)
will likely recur there almost verbatim.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (LORE-95 moved to Resolved as row #31, Cursor → LORE-89, Queue renumbered to 4 remaining items, session-log entry appended for session 32) |
| Queue | 4 tasks remaining, all `To Do`, all `bug` type: LORE-89/88/91/93 |
| Resolved this session | LORE-95 — see Resolved table row 31 for full evidence summary |
| Branch | `dev`, clean except pre-existing untracked dirs, 1 commit ahead of `origin/dev` (`ea414c0`, this session's archive commit) — **push this before doing anything else next session** |
| Leftover branches/PRs | none — `feature/LORE-95` was merged (PR #87, `gh pr merge --rebase --delete-branch`) and pruned both remotely and locally automatically |
| Not queued | LORE-42/43/44/45 (deferred by recorded product decisions, unchanged) plus the accumulated independent-review follow-up candidates from sessions 9-32 (see tracker's Not-queued section, including last session's Windows `O_NOFOLLOW` gap) |

## Next steps

1. **First action of the next session**: `git push origin dev` — this session's archive commit (`ea414c0`) is local-only.
2. Run the per-issue lifecycle on **LORE-89** (`lore check`'s own concept-scan never forwards a custom profile): branch `feature/LORE-89` off `dev`, read the task's AC (`backlog task view LORE-89 --plain`), re-verify the gap fresh against current `src/commands/check.ts`, resolve the "which root does the profile load against" open question above by reading LORE-84's own diff/PR first, implement (AC#1), add the reject/accept regression tests (AC#2/#3), add a check.ts-command-layer test proving `check` now agrees with `validate`/`query` on the same file (AC#4), verify, review, commit fix+tests, run independent review, THEN update the tracker with the outcome, PR, self-merge, prune.
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch (per the skill's step 4) — advance cursor to LORE-88 — but only AFTER the independent review completes.
4. Continue the confirmed queue order: LORE-88 → LORE-91 → LORE-93. Read LORE-89's own resolution before starting LORE-88, per the paste-ready prompt's note above (closely related task, same design questions likely recur).

## Critical context / traps

- **This session's archive commit is unpushed** — push it first thing next session.
- **LORE-89 and LORE-88 are closely related** (same "thread a project's custom profile through" pattern that LORE-84 already established for `loadBundle`'s 9 call sites, now needed for check.ts's separate parse path and, next, for `rewriteInbound`'s re-serialize path) — resolve LORE-89's design questions carefully since LORE-88 will likely face the same ones.
- **Line numbers in `check.ts` had NOT drifted this session** — matched the filing task's citations exactly — but two of the last three sessions found real drift in whatever file they touched (`fswrite.ts` twice in a row). Never assume a citation still holds without checking.
- **The review step can find genuine blocking defects, not just non-blocking follow-ups** — confirmed at LORE-92 (session 31): a discarded `writeSync` return value and an undocumented Windows platform gap, both real, both required a second implementation round. Budget for this on every task, especially one with an open design question like LORE-89's "which root" question.
- **A useful review-verification pattern has emerged across the last two sessions' independent reviews**: revert the fix's source files (via `git stash` or similar), rerun the NEW tests, confirm they genuinely fail without the fix (not vacuous/tautological), then restore and rerun the full suite. Worth explicitly asking for this in the review prompt for LORE-89 too, especially for AC#4's "check and validate/query now agree" claim — a reviewer should independently confirm the pre-fix disagreement was real, not just accept the task's own filed repro at face value.
- **`.repro-scratch/` keeps accumulating scratch files** — this session added `lore95-verify/` (a scratch bundle directory, not a single script — a new shape for this convention, still left in place). Still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- **Archive handover naming**: `archive/handovers/HANDOVER-2026-07-21-backlog-campaign.md` through `-22` already existed — this session's archive used suffix `-23`. Check `ls archive/handovers/` fresh each time.
- **`backlog task edit`'s AC-checking flag is `--check-ac <index>`, not `--ac <index:checked>`** — caught and fixed at session 30 (LORE-94); this session used the correct flag from the start. Keep doing that.
- When live-CLI-verifying, write a throwaway script/scratch bundle under `.repro-scratch/` and drive the real `src/cli.ts` via `bun run` from inside the scratch directory (no `--cwd`). For a fix spanning two files, `git stash push -- <file1> <file2>` then rerun, then `git stash pop`, is now this campaign's established way to prove a repro is real before AND after a fix.
- No exported `parse*Args` function exists anywhere in this codebase — don't export one just to unit-test a fix in isolation.
- Two files in `.claude/handovers/` — `HANDOVER-2026-07-21T105420Z.md` and `HANDOVER-2026-07-21T130922Z.md` — use a different (ISO-timestamp) naming convention and are NOT part of this campaign's topic; leave them alone.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all 32 campaign sessions to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a correctness fix is real — live-CLI-verify against a real scratch bundle too. For LORE-89 specifically: confirm the three-way disagreement (`check` vs. `validate`/`query`/`sync`) is real on current dev HEAD BEFORE implementing, the same way LORE-95 confirmed its own two gaps were real via `git stash` pre/post comparison.
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check.
- Don't re-derive the "thread a profile through" pattern from scratch — LORE-84 already solved this for `loadBundle`'s 9 callers; read that precedent (task notes, PR diff) before writing new profile-loading code for check.ts.
- Don't write a tracker Resolved-row or session-log entry that asserts a review outcome before the review has actually run.
- Don't skip a second implementation round if independent review finds a real blocking defect — treat that as the norm to be ready for, not an exception.
- Don't guess a `backlog task edit` flag name for anything that mutates Backlog data — run `backlog task edit --help` first.
- Don't assume a single `loadProfile({root: options.root})` call is correct for every one of check.ts's multi-bundle-root scenarios without first checking how `Bundle.root` relates to `options.root` in this codebase — this is the one genuinely open design question this session identified but did not resolve.
