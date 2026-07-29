# Handover — tenth backlog campaign session, cursor at LCLI-88 (item 6 of 8)

**Date**: 2026-07-21 | **Grounded against**: `dev @ ca93a39`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 1 commit ahead of `origin/dev` (this session's archive commit — push it first thing) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-88 — core/rewrite.ts's rewriteInbound (the shared engine behind
`lore rename` and `lore supersede --rewrite-links`) has no `profile` parameter
of its own. Its internal serializeConcept(next) call (rewriteConcept helper,
currently rewrite.ts:363 — RE-VERIFY, this drifted from the filing task's own
citation of 318 because LCLI-95 added ~45 lines earlier in this same file) and
its moved-but-textually-unchanged fallback serializeConcept(concept)
(rewrite.ts:211, this one did NOT drift — it's before LCLI-95's insertion
point) both validate against defaultProfile() regardless of what profile the
caller used to load the bundle. commands/rename.ts's buildPostRenameGraph then
re-parses those same rewritten bytes via parseConcept(path, rewritten) with no
profile either (rename.ts:398/401, unchanged from the filing citation).
commands/supersede.ts's --rewrite-links path calls the identical rewriteInbound
with no profile (supersede.ts:163-167, unchanged). This is the second half of
the "thread a project's custom profile through" pair — LCLI-89 (just resolved)
did the identical pattern for check.ts's own concept-scan path. This is item 6
of the 8-item queue (LCLI-90/94/92/95/89/88/91/93) confirmed by the user on
2026-07-21 ("Risk-ascending, sweep last (Recommended)"); do not re-ask before
taking the next item.

Read the task itself first (`backlog task view LCLI-88 --plain`) — do not
trust this summary alone; re-verify line numbers and the live repro fresh
against current dev HEAD before implementing, per this campaign's standing
discipline (core/rewrite.ts specifically has drifted from EVERY task that's
touched it this campaign — LCLI-95 shifted it once already; check again).

READ LCLI-89's OWN RESOLUTION FIRST (`backlog task view LCLI-89 --plain`,
its Implementation Notes) — this task is explicitly the sibling of that one,
same underlying pattern, and LCLI-89 already resolved the "which profile,
loaded how" design question this task will face too:

Known head start on the actual fix shape (verified this session, not yet
implemented — re-verify before trusting):
- `commands/rename.ts` already calls `loadBundle(docsRoot, { warnings:
  advisories, profile: loadProfile({ root: options.root }) })` at
  rename.ts:147 — but INLINE, not stored in a named variable. The fix will
  need to hoist this into `const profile = loadProfile({ root: options.root
  });` so the SAME profile value can also reach the later `rewriteInbound`
  call and `buildPostRenameGraph`'s `parseConcept` calls (AC#4 requires this
  — the bytes serialized and the bytes re-parsed must use the SAME profile
  instance, not two separate loads that could theoretically diverge, e.g. if
  the file changed between two loadProfile calls — pass the ONE loaded value
  through, don't call loadProfile twice).
- `commands/supersede.ts` ALREADY has `const profile = loadProfile({ root:
  options.root });` as a named variable at supersede.ts:124 — reuse it
  directly at its own `rewriteInbound` call site (supersede.ts:163-167), no
  hoisting needed there.
- `rewriteInbound`'s own signature (`RewriteInboundOptions`, core/rewrite.ts)
  needs a new optional `profile` field, threaded into BOTH internal
  `serializeConcept` calls (rewriteConcept's `serializeConcept(next)` and the
  moved-but-unchanged fallback `serializeConcept(concept)`) — check
  `serializeConcept`'s own signature in core/concept.ts for how it accepts a
  profile option (mirrors `parseConcept`'s `ParseConceptOptions`).

AC#3 wants `rewriteInbound` tested DIRECTLY (not only through rename.ts's/
supersede.ts's command-layer tests) with a non-default profile passed
explicitly — check test/rename.test.ts's existing `rewriteInbound(graph(), ...)`
call sites (there are dozens) for the established low-level testing pattern,
and how `graph()`/`writeDoc()` construct a `BundleGraph` fixture in that file,
before deciding whether `rewriteInbound` itself needs a new parameter or an
options-bag field, and whether the test-file's own `graph()` helper needs to
accept/thread a custom profile too.

AC#5 is the explicit non-regression guard: a bundle using ONLY the built-in
default profile must see NO change in rename/supersede behavior — this is a
profile-THREADING fix, not a validation-strictness change. The existing full
rename.test.ts/supersede.test.ts suites passing unchanged IS this proof; don't
skip re-running them.

Merge gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. Run the lifecycle's step 6 independent review (general-
purpose subagent) AFTER committing the fix+tests, THEN write the outcome into
the tracker — and COMMIT the notes update BEFORE running `gh pr merge`. This
session's own review-outcome notes commit landed AFTER the PR had already
been merged (the first `gh pr merge` attempt actually succeeded server-side
despite a local error, before the notes commit was pushed) — the commit had
to be salvaged via `git cherry-pick` onto dev directly, and the orphaned
remote `feature/LCLI-89` branch (left over because `--delete-branch` never
ran) had to be cleaned up manually afterward. Sequence correctly next time:
finish ALL commits (fix, tracker update, review-outcome notes) and push them
ALL before calling `gh pr merge`.

Also budget real time for a review round: LCLI-89's own independent review
first came back as an incomplete status update ("launched a background wait
for a Codex review") instead of actual findings — had to be re-prompted via
`SendMessage` with an explicit "answer now, in this turn, don't just report
status" framing before it produced a complete, useful review. If a review
subagent's response looks like a status update rather than findings, don't
treat it as final — resume it and demand the real answer.

After LCLI-88: advance cursor to LCLI-91, then LCLI-93 in that confirmed
order. LCLI-93 (ensureDir call sites in 5 commands follow symlinks) is the
largest-surface item, saved for last per the user's own stated risk-ascending
ordering — budget extra session time/rounds for it when its turn comes.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (LCLI-89 moved to Resolved as row #32, Cursor → LCLI-88, Queue renumbered to 3 remaining items, session-log entry appended for session 33) |
| Queue | 3 tasks remaining, all `To Do`, all `bug` type: LCLI-88/91/93 |
| Resolved this session | LCLI-89 — see Resolved table row 32 for full evidence summary |
| Branch | `dev`, clean except pre-existing untracked dirs, 1 commit ahead of `origin/dev` (`ca93a39`, this session's archive commit) — **push this before doing anything else next session** |
| Leftover branches/PRs | none — `feature/LCLI-89` was merged (PR #88) then manually cleaned up after a merge-sequencing snag (see Critical context below); confirmed via `git branch -a`/`gh pr list --state open` at end of session |
| Not queued | LCLI-42/43/44/45 (deferred by recorded product decisions, unchanged) plus the accumulated independent-review follow-up candidates from sessions 9-33 (see tracker's Not-queued section) |

## Next steps

1. **First action of the next session**: `git push origin dev` — this session's archive commit (`ca93a39`) is local-only.
2. Run the per-issue lifecycle on **LCLI-88** (`rewriteInbound` never forwards a custom profile): branch `feature/LCLI-88` off `dev`, read the task's AC (`backlog task view LCLI-88 --plain`), read LCLI-89's own resolution notes first (same pattern, already-resolved design questions), re-verify the gap fresh against current `core/rewrite.ts`/`commands/rename.ts`/`commands/supersede.ts` (line numbers WILL have drifted in `core/rewrite.ts` — verify before trusting the citations above), implement (AC#1/#2/#4), add the direct-engine-level test (AC#3) plus the command-layer regression tests, confirm no behavior change for default-profile bundles (AC#5, the existing suites), verify, review, commit fix+tests, run independent review — **commit and push the review-outcome notes update BEFORE calling `gh pr merge`**, THEN update the tracker with the outcome, PR, self-merge, prune.
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch (per the skill's step 4) — advance cursor to LCLI-91 — but only AFTER the independent review completes AND its outcome is committed.
4. Continue the confirmed queue order: LCLI-91 → LCLI-93.

## Critical context / traps

- **This session's archive commit is unpushed** — push it first thing next session.
- **PR-merge sequencing pitfall (new this session, avoid repeating)**: after opening PR #88, the first `gh pr merge --rebase --delete-branch` call actually succeeded on GitHub's server side, but the LOCAL post-merge steps (checkout `dev`, etc.) failed because an uncommitted task-notes update was still sitting in the working tree — `gh`'s error output looked like total failure (exit 1), but the merge had already happened. Committing the notes update AFTER that point meant pushing it to a branch whose PR was already closed — the commit never made it into the merge. Had to `git cherry-pick` the orphaned commit directly onto `dev`, then manually delete the leftover `origin/feature/LCLI-89` branch (`--delete-branch` never got to run). **Lesson**: finish and commit EVERYTHING (fix, tracker update, review-outcome notes) and push it all to the feature branch BEFORE calling `gh pr merge` — never edit/commit anything to the feature branch after that call, and if a `gh pr merge` call errors, check `gh pr view <N> --json state` before assuming nothing happened.
- **A review subagent's first response can be an incomplete status update, not real findings** (new this session) — LCLI-89's independent review agent came back saying it had "launched a background wait for a Codex review" with no actual findings. Don't accept that as final: use `SendMessage` (load via `ToolSearch("select:SendMessage")` if not already loaded) to resume the SAME agent with an explicit "answer now, in this turn, with real findings" framing. It then delivered a thorough, complete review (which happened to also include a self-initiated corroborating Codex pass) — the resumed agent retains full context, so this is fast, not a restart.
- **LCLI-88 and LCLI-89 are the same underlying pattern applied to two different code paths** — LCLI-89 threaded a profile into `check.ts`'s parse-only scan; LCLI-88 needs a profile threaded into `rewriteInbound`'s serialize-then-reparse round-trip (a genuinely bigger surface: BOTH the write side and the re-read side must agree on the same profile instance, per AC#4). Read LCLI-89's resolution notes before starting — the "how does this command's profile relate to check.ts's/rename.ts's own `loadBundle` call" reasoning transfers almost directly.
- **`core/rewrite.ts` has now drifted in TWO consecutive sessions that didn't even touch it themselves** (LCLI-89 didn't touch it, but LCLI-95's earlier edit still means LCLI-88's citations are stale) — always re-verify line numbers in this specific file before trusting any task's own citation.
- **`.repro-scratch/` keeps accumulating scratch files** — this session added `lore89-verify/` (a scratch bundle directory) and `lore89-scan-verify.ts` (a fakeAdapter-based repro script), left in place per convention.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- **The local `backlog` binary on PATH is stock v1.48.0, not this repo's `--json`-capable pinned fork** — a full real-CLI run of `lore check`/`sync` against a scratch bundle with genuine `tasks:`-linked reconciliation will fail at the Backlog probe step in THIS environment. Use `fakeAdapter` (from `test/helpers.ts`) driving `runCheck`/`runSync` directly for live-CLI-style verification of anything involving Backlog reconciliation — this is a legitimate seam (fakes only the external IO boundary), not a synthetic shortcut. LCLI-88 likely doesn't need Backlog reconciliation at all (rename/supersede's `rewriteInbound` core engine has no Backlog dependency), so this may not even come up.
- **Archive handover naming**: suffix `-24` used this session (through `-23` already existed). Check `ls archive/handovers/` fresh each time.
- **`backlog task edit`'s AC-checking flag is `--check-ac <index>`, not `--ac <index:checked>`** — this session used the correct flag from the start.
- No exported `parse*Args` function exists anywhere in this codebase — don't export one just to unit-test a fix in isolation.
- Two files in `.claude/handovers/` — `HANDOVER-2026-07-21T105420Z.md` and `HANDOVER-2026-07-21T130922Z.md` — use a different (ISO-timestamp) naming convention and are NOT part of this campaign's topic; leave them alone.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all 33 campaign sessions to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't call `gh pr merge` while any commit (fix, tracker, notes) is still uncommitted or unpushed on the feature branch — finish everything first, per this session's own recovered mistake.
- Don't treat a review subagent's first response as final if it reads like a status update rather than delivered findings — resume it and demand a complete answer in the same turn.
- Don't trust a synthetic test suite alone as proof a correctness fix is real — live-CLI-verify (or, where the real `backlog` binary can't cooperate in this environment, `fakeAdapter`-based `runCheck`/`runSync` driving real production code) too.
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check.
- Don't re-derive the "thread a profile through" pattern from scratch for LCLI-88 — LCLI-89 (and, further back, LCLI-84) already solved this shape; read those precedents' notes/diffs before designing something new.
- Don't write a tracker Resolved-row or session-log entry that asserts a review outcome before the review has actually run.
- Don't guess a `backlog task edit` flag name for anything that mutates Backlog data — run `backlog task edit --help` first.
- Don't call `loadProfile` twice for the same command invocation when one already-loaded value can be threaded through instead (AC#4's exact concern for LCLI-88) — hoist into a named variable and reuse it.
