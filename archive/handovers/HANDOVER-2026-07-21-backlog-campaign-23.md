# Handover — eighth backlog campaign session, cursor at LORE-95 (item 4 of 8)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 281b261`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 1 commit ahead of `origin/dev` (this session's archive commit — push it first thing) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-95 — core/rewrite.ts's escapesRoot (currently lines 265-281 — matched the
task's own citation exactly at pickup time, but RE-VERIFY anyway per standing
discipline) has two independently-confirmed uncaught edge cases: (1) a Windows
drive-relative id like "C:foo" passes every check assertConfinedToBundle
(rewrite.ts:241-250) and rename.ts's assertDestinationConfined (rename.ts:426-434)
rely on; (2) an empty string or self-cancelling newId like "sub/.." keeps
escapesRoot's depth counter at 0 throughout, so it's accepted and silently renames
to a hidden dotfile "docs/..md" at the bundle root. This is item 4 of the 8-item
queue (LORE-90/94/92/95/89/88/91/93) confirmed by the user on 2026-07-21
("Risk-ascending, sweep last (Recommended)"); do not re-ask before taking the next
item.

Read the task itself first (`backlog task view LORE-95 --plain`) — do not trust
this summary alone; re-verify line numbers and both live repros fresh against
current dev HEAD before implementing. The filing task's own live repro for gap
(2): `lore rename reference/orders ""` and `lore rename reference/orders "sub/.."`
both exit 0, report success, and `lore check` afterward shows 0 errors — re-run
this against current dev HEAD in a scratch bundle before trusting it's still true.

Two independent gaps, both need covering (this task explicitly merges them since
they hit the exact same function and the exact same two guard call sites — the
established "close every layer" pattern this campaign already used for
LORE-78/79/80's own escapesRoot-adjacent cluster):

1. Windows drive-relative ids (AC#1/AC#2/AC#7 partial): "C:foo" (drive+colon, NO
   following separator — real Windows drive-relative syntax, distinct from the
   absolute "C:\...\" form LORE-72 already covers) passes because
   win32.isAbsolute/posix.isAbsolute both correctly say false, and escapesRoot's
   segment walk sees one segment with no ".." — needs a NEW check, since neither
   existing absolute-path guard catches this shape. The filing task itself notes
   real exploitability at the write layer is unconfirmed/likely narrower than a
   cross-drive escape (can't verify further from a POSIX host) — reject it anyway
   at both guard layers per the stated ACs, don't let that caveat become a reason
   to skip the fix.

2. Empty/self-cancelling newId (AC#3/#4/#5/#7 partial): needs a `rel === ""` (or
   equivalent normalized-to-root) check — the task explicitly points at `lore
   new`'s `resolveOutPath` as the guard's own stated inspiration, which ALREADY
   rejects this shape; escapesRoot never inherited that check when factored out
   in LORE-80 (worth reading resolveOutPath in src/commands/new.ts first to see
   the established pattern before writing a new one). AC#5 requires this land at
   the SHARED core/rewrite.ts engine layer (not just rename.ts's own pre-check),
   so any other current/future caller of the shared engine inherits the
   protection too.

AC#6 is a real false-positive guard: a destination segment that merely STARTS
WITH ".." (e.g. "..foo/bar") or a path that legitimately cancels through a real
intermediate directory to a non-root destination must keep succeeding — don't
overcorrect into rejecting valid non-traversal paths that happen to contain ".."
as a substring or a real cancel-then-continue shape.

Merge gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. Run the lifecycle's step 6 independent review (general-purpose
subagent) AFTER committing the fix+tests, THEN write the outcome into the tracker.
**This campaign's review step found its first-ever BLOCKING findings last session
(LORE-92)** — a discarded writeSync return value (silent truncation risk) and an
undocumented Windows platform gap — both real, both fixed in a second round before
merge. Don't treat the review as a formality; budget time for a possible second
implementation round if it finds something real. For a security/correctness task
like LORE-95, specifically ask the reviewer to check for any similarly-shaped
uncaught edge case in escapesRoot's segment walk beyond the two named in the task
(the reviewer's own initiative caught the Windows gap in LORE-92 that wasn't in my
original review prompt — keep giving reviewers room to look beyond the stated
scope, don't over-constrain the prompt).

After LORE-95: advance cursor to LORE-89, then LORE-88, LORE-91, LORE-93 in that
confirmed order.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (LORE-92 moved to Resolved as row #30, Cursor → LORE-95, Queue renumbered to 5 remaining items, a new Not-queued follow-up filed for the Windows O_NOFOLLOW gap, session-log entry appended for session 31) |
| Queue | 5 tasks remaining, all `To Do`, all `bug` type: LORE-95/89/88/91/93 |
| Resolved this session | LORE-92 — see Resolved table row 30 for full evidence summary, including the 2 blocking review findings and their fixes |
| New Not-queued follow-up filed this session | LORE-92's `writeFileNoFollow` fix only closes the TOCTOU race on POSIX — `O_NOFOLLOW` is unimplemented on Windows via libuv (independently confirmed: https://docs.libuv.org/en/v1.x/fs.html). Not a regression (Windows was equally exposed pre-fix), documented in both the code and the tracker; needs a human to confirm priority for a Windows-specific closure. |
| Branch | `dev`, clean except pre-existing untracked dirs, 1 commit ahead of `origin/dev` (`281b261`, this session's archive commit) — **push this before doing anything else next session** |
| Leftover branches/PRs | none — `feature/LORE-92` was merged (PR #86, `gh pr merge --rebase --delete-branch`) and pruned both remotely and locally automatically |
| Not queued | LORE-42/43/44/45 (deferred by recorded product decisions, unchanged) plus the accumulated independent-review follow-up candidates from sessions 9-31 (see tracker's Not-queued section — now includes the Windows O_NOFOLLOW gap from this session) |

## Next steps

1. **First action of the next session**: `git push origin dev` — this session's archive commit (`281b261`) is local-only.
2. Run the per-issue lifecycle on **LORE-95** (`escapesRoot`'s two uncaught edge cases): branch `feature/LORE-95` off `dev`, read the task's AC (`backlog task view LORE-95 --plain`), re-verify both gaps fresh against current `src/core/rewrite.ts`/`src/commands/rename.ts` (this session's citations matched exactly, but re-verify anyway), implement both fixes at both guard layers (AC#1/#2 for the Windows case, AC#3/#4/#5 for the empty/self-cancelling case), add the false-positive regression coverage (AC#6), verify, review, commit fix+tests, run independent review — budget for a possible second round given last session's precedent — THEN update the tracker with the outcome, PR, self-merge, prune.
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch (per the skill's step 4) — advance cursor to LORE-89 — but only AFTER the independent review completes (and any resulting fixes land), filling in its real outcome.
4. Continue the confirmed queue order: LORE-89 → LORE-88 → LORE-91 → LORE-93.

## Critical context / traps

- **This session's archive commit is unpushed** — push it first thing next session, before starting LORE-95's lifecycle.
- **The review step can find real blocking defects, not just non-blocking follow-ups** — LORE-92 was the first session in this campaign (31 sessions in) where independent review found genuine blocking bugs (a discarded `writeSync` return value, an undocumented cross-platform gap). Both required a second implementation round, a second `bun test`/`typecheck`/`lint` pass, and a second live-CLI re-verification before merging. Don't assume the review step is a rubber stamp — budget real time for it, especially on security/correctness-labeled tasks like LORE-95.
- **Independent, unprompted verification is valuable** — this session used `WebSearch` (loaded via `ToolSearch("select:WebSearch")`, since it's a deferred tool not in the default toolset) to independently confirm the reviewer's claim about libuv's Windows `O_NOFOLLOW` support before writing documentation asserting it. Don't take a reviewer's technical claim as ground truth without an independent check when it's cheap to verify and going into permanent code comments/docs.
- **Short-write / partial-syscall correctness matters even for tiny payloads** — LORE-92's real bug (discarded `writeSync` return value) would never have shown up with the small test fixtures already in the suite; it only reproduces under real disk-pressure conditions that aren't reliably triggerable in a test. The fix pattern that worked: extract the accumulation loop as a PURE function taking an injectable `write` callback, then unit-test the loop's own logic with a fake writer that deterministically simulates a short write. If LORE-95's fix has any similar "only reproduces under a real-world condition a test can't force" shape, look for the same extract-as-pure-injectable-function pattern before assuming it's untestable.
- **Line numbers in `core/rewrite.ts`/`commands/rename.ts` had NOT drifted this session** (unlike `fswrite.ts`, which drifted twice in a row from LORE-94 then LORE-92 touching it) — but don't assume that pattern holds; re-verify fresh regardless, since the whole point of this discipline is not trusting a filing task's citations by default.
- **`.repro-scratch/` keeps accumulating scratch files** — this session added `lore92-toctou-verify.ts` and `lore92-large-write-verify.ts`, left in place per convention. Still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- **Archive handover naming**: `archive/handovers/HANDOVER-2026-07-21-backlog-campaign.md` through `-21` already existed — this session's archive used suffix `-22`. Check `ls archive/handovers/` fresh each time.
- **`backlog task edit`'s AC-checking flag is `--check-ac <index>`, not `--ac <index:checked>`** — this trap was caught and fixed in session 30 (LORE-94); avoid repeating it in this or any future session.
- When live-CLI-verifying, write a throwaway script under `.repro-scratch/` importing directly from `../src/...`, invoked via `bun run .repro-scratch/<script>.ts` from the repo root. For a fix where a genuine race/edge condition can't be reliably forced against a real fd/filesystem (like LORE-92's short-write), prefer extracting the core logic as a pure, injectable-dependency function and unit-testing THAT deterministically, rather than trying to force the real-world condition in an integration-style script.
- No exported `parse*Args` function exists anywhere in this codebase — don't export one just to unit-test a fix in isolation.
- Two files in `.claude/handovers/` — `HANDOVER-2026-07-21T105420Z.md` and `HANDOVER-2026-07-21T130922Z.md` — use a different (ISO-timestamp) naming convention and are NOT part of this campaign's topic; leave them alone.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all 31 campaign sessions to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a destructive/security fix is correct — run the real CLI/primitives against real files too. For LORE-95's Windows drive-relative case specifically: this can only be reasoned about from a POSIX host (Node's own `path.win32` module gives correct cross-platform behavior for the string-parsing check itself, even though the actual OS-level write behavior can't be verified from here) — say so explicitly in the task notes rather than overclaiming a live Windows verification that isn't possible in this environment.
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check.
- Don't assume a task's own filed repro is still an open gap without live-CLI-verifying it first — apply it to LORE-95 even though the filing session already did first-pass live verification of both gaps.
- Don't re-derive a security/correctness-sensitive check from scratch when an existing, already-tested one fits — the task itself names `new.ts`'s `resolveOutPath` as the precedent for the empty/self-cancelling-id rejection; read it before writing a new check.
- Don't write a tracker Resolved-row or session-log entry that asserts a review outcome before the review has actually run.
- Don't skip a second implementation round if independent review finds a real blocking defect — LORE-92 needed one; treat that as the norm to be ready for, not an exception.
- Don't guess a `backlog task edit` flag name for anything that mutates Backlog data — run `backlog task edit --help` first.
