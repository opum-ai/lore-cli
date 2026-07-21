# Handover — sixth backlog campaign session, cursor at LORE-94 (item 2 of 8)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 2aa6a77`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), pushed and in sync with `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-94 — schema export's `isManagedSchemasDir` (src/commands/schema.ts,
currently lines ~151-153) is a purely lexical `absOutDir === resolve(root,
SCHEMAS_DIR)` comparison with no realpath/symlink resolution, plus a missing
regression test for near-miss `--out` directory names. This is item 2 of the
8-item queue (LORE-90/94/92/95/89/88/91/93) confirmed by the user on
2026-07-21 ("Risk-ascending, sweep last (Recommended)"); do not re-ask before
taking the next item.

Read the task itself first (`backlog task view LORE-94 --plain`) — do not
trust this summary alone; re-verify line numbers and the repro fresh against
current dev HEAD before implementing, per this campaign's standing discipline
(a LOT changes session to session; LORE-90 re-verified this same way and it
paid off — the task's own line-number claims still matched exactly, but never
assume that holds).

Two independent gaps, both need covering (re-verify both are still live
before implementing):
1. Test coverage gap: no test exercises `--out` pointed at a near-miss
   directory name sharing a lexical prefix with or nesting inside
   `.lore/schemas` (e.g. `.lore/schemas-extra`, `.lore/schema`,
   `.lore/schemas/sub`) — today's code already handles these safely (no
   pruning), but only hand-verified, not locked in by an automated test.
2. Symlink bypass: `isManagedSchemasDir` does no realpath resolution, so a
   `.lore/schemas` that is ITSELF a symlink to another directory still
   satisfies the lexical equality check, and `pruneOrphans` (schema.ts
   ~163-184) will `rmSync` through it into the real target — live-repro'd by
   the filing session: symlinking `.lore/schemas` to an outside directory
   with an unrelated file, then `lore schema export` deleted that file.

Likely fix shape for gap 2 (verify before implementing, don't assume): this
codebase already has a precedented symlink guard for exactly this class of
problem — `assertNoSymlinkInPath` in `src/commands/fswrite.ts:57`
(LORE-76/77), which walks every path segment via `lstatSync` rather than
following. Read that function and its existing call sites
(`fswrite.ts:303`/`322`) before designing a new check from scratch; whether
`isManagedSchemasDir` should call it directly or use `realpathSync`-based
comparison instead is a design choice to make fresh, not something already
decided.

Merge gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. Run the lifecycle's step 6 independent review
(general-purpose subagent) AFTER committing the fix+tests, THEN write the
outcome into the tracker — this ordering discipline has held cleanly across
every session since LORE-74 (most recently LORE-90); don't regress on it.

After LORE-94: advance cursor to LORE-92, then LORE-95, LORE-89, LORE-88,
LORE-91, LORE-93 in that confirmed order.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (LORE-90 moved to Resolved as row #28, Cursor → LORE-94, Queue renumbered to 7 remaining items, session-log entry appended for session 29) |
| Queue | 7 tasks remaining, all `To Do`, all `bug` type: LORE-94/92/95/89/88/91/93 |
| Resolved this session | LORE-90 — see Resolved table row 28 for full evidence summary |
| New Not-queued follow-up filed this session | A non-blocking finding from LORE-90's independent review: `commitBacklogFiles`'s fixed guard reused only `escapesRoot`, not the `win32.isAbsolute` half of `rename.ts`'s three-part precedent pattern. Confirmed live that a win32-absolute-looking suffix (`backlog/C:\Windows\evil.md`) still passes today — not an active escape, outside LORE-90's own ACs, needs a human to confirm priority before filing as its own task. |
| Branch | `dev`, clean, pushed and in sync with `origin/dev` @ `2aa6a77` |
| Leftover branches/PRs | none — `feature/LORE-90` was merged (PR #84, `gh pr merge --rebase --delete-branch`) and pruned both remotely and locally (confirmed via `git fetch --prune`) |
| Not queued | LORE-42/43/44/45 (deferred by recorded product decisions, unchanged) plus the accumulated independent-review follow-up candidates from sessions 9-29 (see tracker's Not-queued section) |

## Next steps

1. Run the per-issue lifecycle on **LORE-94** (schema export near-miss test gap + `isManagedSchemasDir` symlink bypass): branch `feature/LORE-94` off `dev`, read the task's AC (`backlog task view LORE-94 --plain`), re-verify both gaps fresh against current `src/commands/schema.ts` (line numbers may have drifted from the ~151-153/~163-184 cited above), implement both fixes (test coverage AC#1 + symlink guard AC#2/#3, non-regression AC#4), verify, review, commit fix+tests, run independent review, THEN update the tracker with the outcome, PR, self-merge, prune.
2. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch (per the skill's step 4) — advance cursor to LORE-92 — but only AFTER the independent review completes, filling in its real outcome (don't pre-write a review verdict before the review has actually run — this session initially drafted one prematurely and had to backfill placeholders after the fact; avoid repeating that ordering mistake).
3. Continue the confirmed queue order: LORE-92 → LORE-95 → LORE-89 → LORE-88 → LORE-91 → LORE-93.

## Critical context / traps

- **Tracker update ordering**: this session's own step 4 update was drafted BEFORE the independent review ran, which meant the first draft had to include placeholder text swapped in after the review completed. Cleaner for the next session: commit the fix+tests first, run the review, get the real verdict text, THEN draft the tracker's Resolved-row/session-log entry once (no placeholder round-trip needed).
- **`gh pr merge --rebase --delete-branch` deletes the remote branch but can leave a stale `remotes/origin/feature/<KEY>` ref locally** until `git fetch --prune` runs — confirmed this session (`git branch -a` showed the stale ref right after merge; `git fetch --prune` cleared it). Always run `git fetch --prune` as part of step 10, don't just trust `git branch -a` immediately post-merge.
- **`.repro-scratch/` keeps accumulating scratch files** from every review/verification session (this session added a live-CLI verification script + scratch git repo, both left in place per this campaign's standing convention) — still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- **Archive handover naming**: `archive/handovers/HANDOVER-2026-07-21-backlog-campaign.md` already existed (and `-2` through `-19` too, from this campaign's very high session count today) — this session's archive used suffix `-20`. Check `ls archive/handovers/` fresh each time rather than assuming the next available number; today's date has accumulated a lot of sessions.
- When live-CLI-verifying against a scratch repo, do NOT use `bun run --cwd <dir> <script>` — cd into the scratch dir first, then run `bun run <absolute-path-to-src/cli.ts> ...` with NO `--cwd` flag (or, as this session did, write a throwaway script under `.repro-scratch/` that imports directly from `../src/...` and invoke it with `bun run .repro-scratch/<script>.ts` from the repo root — this worked cleanly and avoids the `--cwd` trap entirely). Run `git status --porcelain` in the real repo immediately after every such step.
- Repro scripts with relative `src/` imports must live inside the repo (e.g. under `.repro-scratch/`), not scratchpad/`/tmp` — import resolution breaks otherwise (recurred across multiple prior sessions; held again this session).
- No exported `parse*Args` function exists anywhere in this codebase — every command's argument-parsing function is private and tested only via full CLI/command-runner integration tests. Don't export one just to unit-test a fix in isolation.
- Two files in `.claude/handovers/` — `HANDOVER-2026-07-21T105420Z.md` and `HANDOVER-2026-07-21T130922Z.md` — use a different (ISO-timestamp) naming convention and are NOT part of this campaign's topic; they appear to be artifacts of a separate, unrelated session-recovery mechanism. Leave them alone; this skill's archive step only ever touches its own `-backlog-campaign` topic file.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all 29 campaign sessions to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a destructive/security fix is correct — run the real CLI against a scratch repo too (this session did, for LORE-90; the same discipline applies to LORE-94's symlink-deletion behavior — a synthetic fake-fs test would NOT be sufficient proof there, a real scratch directory with a real symlink is needed, mirroring how LORE-90 needed a real scratch git repo).
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check.
- Don't assume a task's own filed repro is still an open gap without live-CLI-verifying it first — this campaign's single highest-value discipline; apply it to LORE-94 even though the filing session already did a first-pass live verification of both gaps (re-verify at pickup time too, since state can drift between sessions).
- Don't re-derive a security/correctness-sensitive check from scratch when an existing, already-tested one fits — check `fswrite.ts`'s `assertNoSymlinkInPath` (LORE-76/77 precedent) before writing something new for LORE-94's symlink gap, the same way LORE-90 reused `core/rewrite.ts`'s `escapesRoot` instead of re-deriving a new traversal check.
- Don't write a tracker Resolved-row or session-log entry that asserts a review outcome before the review has actually run — draft it once, after the review completes, with the real verdict (see "Critical context" above).
- Don't export a private `parse*Args` function just to unit-test a fix in isolation — no precedent for this anywhere in the codebase; stick to CLI-level integration tests like every other command.
