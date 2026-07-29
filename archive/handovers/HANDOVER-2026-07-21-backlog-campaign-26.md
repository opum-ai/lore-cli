# Handover — eleventh (final) backlog campaign session, cursor at LCLI-93 (item 8 of 8)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 5f8ff34`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), pushed and in sync with `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-93 — five `ensureDir` call sites (new.ts:127, agents.ts:72, sync.ts:174,
schema.ts:106, rename.ts:280/286 — RE-VERIFY these, especially rename.ts which has
drifted by +2 from the filing task's own 278/284 citation every recent session that
touched it) follow symlinks: `ensureDir` (fswrite.ts:82) is a bare
`mkdirSync(absPath, {recursive:true})` with no guard, unlike `writeAllOrRollback`
and `init.ts`'s own loops, which separately call `assertNoSymlinkInPath` BEFORE
their own `ensureDir` calls. This is item 8 of 8 — the FINAL item in this
campaign's queue, explicitly saved for last by the user as the largest-surface
item; do not re-ask before taking it.

Read the task itself first (`backlog task view LCLI-93 --plain`) — do not trust
this summary alone; re-verify all 5+ line numbers and the live repro fresh
against current dev HEAD before implementing.

## The key design insight this session found (verify before trusting, but this is
## the shape most consistent with the codebase's own existing precedent):

`ensureDir`'s CURRENT signature is `ensureDir(absPath: string, relPath: string): void`
— it takes an already-resolved absolute path, so it has no `root` to call
`assertNoSymlinkInPath(root, relPath)` with internally. TWO of its existing 8
call sites (`fswrite.ts:338` inside `writeAllOrRollback`, `init.ts:65`) already
call `assertNoSymlinkInPath(root, relPath)` SEPARATELY, immediately before their
own `ensureDir` call — i.e., the guard already exists and is already proven, it's
just not wired into `ensureDir` itself, so every OTHER caller (the 5 in this
task, plus any future one) silently lacks it.

**The likely-correct fix is a BLANKET one at the `ensureDir` level**, not five
separate per-call-site patches: change `ensureDir`'s signature to take `root`
instead of a pre-joined `absPath` (e.g. `ensureDir(root: string, relPath: string)`,
deriving the absolute path internally via `join(root, relPath)`), call
`assertNoSymlinkInPath(root, relPath)` first, then `mkdirSync`. This closes all 5
unguarded call sites AND the 2 already-guarded ones in one place — and the 2
already-guarded callers' own now-redundant separate `assertNoSymlinkInPath` calls
should then be removed (harmless to leave, but confusing/duplicative). This is a
signature-breaking change touching all ~8 `ensureDir` call sites across
`new.ts`/`agents.ts`/`sync.ts`/`schema.ts`/`rename.ts`(×2)/`init.ts`/`fswrite.ts`
itself — re-verify this reasoning and the exact call list fresh (`grep -rn
"ensureDir(" src/`) before committing to this design; it was NOT implemented this
session, only investigated and reasoned through.

## AC#5 (all-or-nothing for multi-file operations) — a genuinely non-obvious
## design question, partially pre-resolved by existing precedent:

`rename.ts`'s `commitWrites` (currently ~line 273) has its OWN docstring already
stating: **"A mid-commit IO failure can still leave the bundle partially
rewritten — cross-file transactional rollback is a shared concern with `lore
replace`, deferred."** This is an existing, accepted, documented gap for
UNRELATED IO failures — meaning full transactional rollback is likely NOT what
AC#5 is actually asking for (that would be new scope well beyond LCLI-93, and
inconsistent with this already-deferred precedent). The more consistent
interpretation: PRE-VALIDATE every write target's symlink-safety (via the
non-throwing `findSymlinkSegment`, not the throwing `assertNoSymlinkInPath`)
across the WHOLE planned write set BEFORE writing any single file — so the
guard fires before the loop starts, not partway through it, avoiding a genuinely
NEW partial-write class distinct from the already-accepted "a crash/IO fault
mid-loop can leave partial writes" one. `sync.ts` (uses `writeFileAtomic`, no
whole-operation rollback either) and `agents.ts` (same atomic-per-file shape)
likely need the identical preflight-scan treatment — verify their own
docstrings/ADR references for the established convention before assuming this
transfers identically, though the shape looks the same on inspection this
session.

`schema.ts`'s single `ensureDir(absOutDir, outArg)` call (line 106) is simpler
— one directory, no multi-file loop — but note it's a SEPARATE layer from
LCLI-94's own fix (`isManagedSchemasDir`'s pruning gate): LCLI-94 stopped
`pruneOrphans` from deleting through a symlinked `.lore/schemas`, but did
nothing about `ensureDir` itself following a symlink to WRITE the schema files
in the first place — these are two independent gaps in the same file, don't
conflate them or assume LCLI-94 already covers this.

## Test/repro shape (from the filing task's own live repro, re-verify fresh):

A scratch bundle with `docs/evil` symlinked to an outside directory. Pre-fix:
`lore rename reference/orders evil/pwned` prints a MISLEADING warning ("skipping
symlink evil: symlinks are not followed" — that's `loadBundle`'s READ-path
graph-walk guard, describing a completely different code path) then reports
SUCCESS (exit 0) while actually writing outside `docs/` entirely, and
`lore new reference "New Evil Doc" --out docs/evil/newevil.md` succeeds with
no warning at all (new.ts never calls loadBundle, so it doesn't even get the
misleading-but-present warning rename.ts does). AC#6 wants regression tests
for at least rename and new reproducing this and asserting refusal.

Merge gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. Run the lifecycle's step 6 independent review (general-
purpose subagent) AFTER committing the fix+tests — ask it explicitly for
complete findings in ONE response (not a status update; two sessions this
campaign needed a re-prompt before learning to ask for this up front — LCLI-89's
and LCLI-91's own prompts show the exact working phrasing). THEN update the
tracker — and commit and PUSH every commit (fix, tracker, review-outcome notes)
BEFORE calling `gh pr merge`, per two hard-won lessons this campaign already
paid for:
1. (Session 33/LCLI-89) A notes commit made AFTER `gh pr merge` had already
   succeeded server-side got orphaned — had to be cherry-picked onto dev
   directly and the leftover remote branch cleaned up manually.
2. (Session 35/LCLI-91, THIS session) An UNPUSHED local archive commit from a
   PRIOR session (created but never `git push origin dev`'d) got silently
   carried along and merged via `gh pr merge --rebase`'s own rebase — landing
   on origin/dev under a NEW SHA, which then made local `dev` un-fast-forward-
   able ("diverging branches") on the FOLLOWING `git status`/merge attempt.
   Recovered safely by diffing the two SHAs to confirm byte-identical content,
   then `git reset --hard origin/dev` — but this would have been much worse
   if there'd been genuine unique local-only content. **Lesson: always
   `git push origin dev` immediately after EVERY commit made directly on dev
   (not just at the end of R5) — don't let any local-only commit on dev
   survive to the start of the next session's branch-off point.**

**Given this is the last item, run R6's "queue empty" wrap-up after this
session resolves it**: summarize the full Resolved table, archive the final
handover (no new one needed), and tell the user the campaign is complete —
`/backlog-handover init` is the path to a fresh queue if there's more backlog
worth burning down later.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (LCLI-91 moved to Resolved as row #34, Cursor → LCLI-93, Queue is now the single final item, session-log entry appended for session 35) |
| Queue | 1 task remaining: LCLI-93 (`bug`, `To Do`) — the final item |
| Resolved this session | LCLI-91 — see Resolved table row 34 for full evidence summary |
| Branch | `dev`, clean except pre-existing untracked dirs, pushed and in sync with `origin/dev` @ `5f8ff34` — **confirm this is still true first thing next session; this session had a divergence scare from an unpushed prior-session commit, see Critical context below** |
| Leftover branches/PRs | none — `feature/LCLI-91` was merged (PR #90) and pruned both remotely and locally; confirmed via `git branch -a` and `gh pr list --state open` |
| Not queued | LCLI-42/43/44/45 (deferred by recorded product decisions, unchanged) plus the accumulated independent-review follow-up candidates from sessions 9-35 (see tracker's Not-queued section) |

## Next steps

1. Run the per-issue lifecycle on **LCLI-93**: **branch FIRST this time** (`git checkout -b feature/LCLI-93 dev`) — this session skipped that step initially for LCLI-91 and had to recover mid-stream; don't repeat it. Read the task's AC (`backlog task view LCLI-93 --plain`), re-verify all 5+ `ensureDir` call sites fresh, investigate the blanket-fix-at-`ensureDir` design sketched above (verify it's still sound, don't just implement it blindly), resolve AC#5's all-or-nothing question per the reasoning above (or overturn it with better evidence), implement (AC#1-#5), add regression tests for at least rename and new (AC#6), verify, review, commit fix+tests, run independent review (ask for complete findings in one response), **commit and push the review-outcome notes update BEFORE calling `gh pr merge`**, THEN update the tracker, PR, self-merge, prune.
2. This is the LAST item — after resolving it, run R6's queue-empty wrap-up (summarize the Resolved table, archive the final handover, no new one, tell the user the campaign is complete).

## Critical context / traps

- **A local commit made directly on `dev` (not a feature branch) must be pushed immediately, not deferred to "later in R5"** — this session's own archive-handover commit for LCLI-88 (made at the end of session 34) was never explicitly `git push origin dev`'d before session 35 branched off it. When session 35's PR #90 was rebase-merged, GitHub's rebase picked up that unpushed commit as part of the rebase (since it was reachable from the pushed feature branch), landing it on `origin/dev` under a NEW SHA — leaving local `dev` "diverged" (same content, different SHA) from origin. Recovered via `git diff <old-sha> <new-sha>` (confirmed byte-identical) then `git reset --hard origin/dev`. This would have been genuinely destructive if there'd been real unique content only on the local SHA. **The fix going forward: `git push origin dev` right after EVERY commit made directly on dev, don't batch it.**
- **Branch before implementing, always** — this session implemented LCLI-91's fix and tests directly on `dev` before catching that step 1 (branch) had been skipped. Recovered cleanly via `git checkout -b feature/LCLI-91` from the same HEAD (uncommitted changes carry over to a new branch created from the current HEAD), but only because nothing had been committed yet. If this happens again AFTER a commit exists on `dev`, recovery is much harder — catch it before implementing, not after.
- **`ensureDir`'s current signature (`absPath`, `relPath`) has no `root` parameter** — any fix threading a symlink guard through it needs a signature change (breaking, ~8 call sites), not just an internal addition. Confirmed this session; not yet implemented.
- **`.repro-scratch/` keeps accumulating scratch files** — this session added `lore91-verify/` and `lore91-outside/`, left in place per convention.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review, and explicitly ask it for complete findings in one response (not a status update) — this phrasing, learned the hard way across sessions 33/35, reliably gets a complete first-pass review.
- No exported `parse*Args` function exists anywhere in this codebase — don't export one just to unit-test a fix in isolation.
- Two files in `.claude/handovers/` — `HANDOVER-2026-07-21T105420Z.md` and `HANDOVER-2026-07-21T130922Z.md` — use a different (ISO-timestamp) naming convention and are NOT part of this campaign's topic; leave them alone.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all 35 campaign sessions to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't leave a commit made directly on `dev` unpushed, even briefly — push immediately after creating it.
- Don't implement a fix before creating the feature branch — check `git branch --show-current` before the first edit, not after.
- Don't trust a synthetic test suite alone as proof a destructive/security fix is real — live-CLI-verify (real scratch bundle, real symlink, `git stash` pre/post comparison) too, this campaign's now well-established pattern for exactly this class of fix (LCLI-76/77/90/92/94/95/88/91 all did this).
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check.
- Don't re-derive `assertNoSymlinkInPath`/`findSymlinkSegment` from scratch for LCLI-93 — both already exist in `fswrite.ts`, proven across 4 prior tasks this campaign (LCLI-76/77/94/92); reuse, don't reinvent.
- Don't write a tracker Resolved-row or session-log entry that asserts a review outcome before the review has actually run.
- Don't guess a `backlog task edit` flag name for anything that mutates Backlog data — run `backlog task edit --help` first.
- Don't assume full transactional rollback is what AC#5 wants without first reading `rename.ts`'s own `commitWrites` docstring (it already documents deferred rollback as an accepted gap) — a preflight symlink scan across all planned targets is the more consistent, smaller-scoped interpretation, per this session's own reasoning above.
