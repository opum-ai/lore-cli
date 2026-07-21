# Handover — fourth backlog campaign session, cursor at LORE-81 (last queue item)

**Date**: 2026-07-21 | **Grounded against**: `dev @ a787133`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 1 unpushed commit at write time (this session's archive commit — pushed immediately after writing this) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-81 — lore rename index <new> (renaming FROM the reserved root
index) is not rejected, corrupts docs/index.md. This is the LAST item in the
queue. Queue order confirmed by the user on 2026-07-21 ("Use this order
(Recommended)"); do not re-ask. LORE-80/79/78 (the rename-destination-
traversal cluster) are all Done.

LORE-81's own AC: "#1 lore rename rejects oldId == index (the bundle root
index) with a clear usage error, matching supersede.ts behavior" and "#2 A
test covers `lore rename index <new-name>` and asserts it is rejected rather
than leaving docs/index.md missing." Read the task itself first
(`backlog task view LORE-81 --plain`) — do not trust this summary alone.

Root-cause claim to verify, not assume: `commands/rename.ts` calls
`assertNotReservedStem(newId, "rename to")` at line 134 — only on `newId`,
never on `oldId`. `commands/supersede.ts` checks BOTH (`assertNotReservedStem(oldId, "supersede")`
at line 119, `assertNotReservedStem(newId, "supersede")` at line 120) — this
task asks rename to match that symmetry. `RESERVED_STEMS` (`core/scaffold.ts:48`)
is `Set(["index", "log"])`. Live-CLI-verify the claimed corruption FIRST
(this campaign's standing convention): build a scratch bundle with a real
`docs/index.md` (frontmatter'd, so it loads as a graph concept) and run
`lore rename index some-new-name` against it — confirm whether `docs/index.md`
actually goes missing afterward as the task describes, and on which exit
code/error type the command currently returns (if any) before assuming the
fix shape.

Likely fix shape (verify before implementing): add `assertNotReservedStem(oldId, "rename from")`
in `runRename`, mirroring supersede's own two-sided check — but confirm the
message/hint wording fits "rename from" as a distinct action phrase (the
existing function's signature is `assertNotReservedStem(id, action)`, action
strings already differ per caller: "rename to", "supersede"). Check whether
this needs to run before or after the existing `assertNotReservedStem(newId, ...)`
call and the `oldId === newId` equality check at rename.ts's top, and whether
it needs to happen before or after the newId-confinement check now living in
`parseRenameArgs` (LORE-78, this session's own prior work) — read the current
`runRename`/`parseRenameArgs` order in `src/commands/rename.ts` fresh, don't
assume today's line numbers.

Merge gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. Run the lifecycle's step 6 independent review
(general-purpose subagent) AFTER committing the fix+tests, THEN write the
outcome into the tracker — this ordering discipline has now held cleanly
across LORE-74 (after a correction), LORE-75, LORE-80, LORE-79, and LORE-78;
don't regress on it.

This is the LAST item in the confirmed queue — after resolving it, the
Queue table in doc-1 will be empty. Per the skill's own restore-mode
instructions: report the campaign complete, summarize the Resolved table,
archive the final handover (write no new one), and suggest `/backlog-handover init`
for a fresh queue (there are unqueued/deferred items in doc-1's Not-queued
section — LORE-42/43/44/45, plus several follow-up candidates surfaced by
this campaign's own reviews — that a human should triage before a new init).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LORE-81, Queue = 1 item, LORE-78 moved to Resolved with its evidence + review outcome) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 1 task remaining: LORE-81, `To Do`, `bug`, `High` priority, labels `codex-review, correctness` |
| Branch | `dev`, clean, 1 commit ahead of `origin/dev` at write time (this session's archive commit; pushed immediately after this handover is written) |
| Leftover branches/PRs | none — `feature/LORE-78` fully merged (PR #82, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune` + `git branch -a`) |
| Not queued | LORE-42/43/44/45 (deferred) plus all prior follow-up candidates recorded across sessions 13-25 (symlink-based filesystem escape in `rename`/`new`, empty/self-cancelling-newId edge case, cross-platform path-validation gaps, custom-profile propagation gaps, a Windows drive-relative id edge case) — none of these block LORE-81; all await a human priority decision |

## Next steps

1. Run the per-issue lifecycle on **LORE-81** (`lore rename` doesn't reject `oldId == index`): branch `feature/LORE-81` off `dev`, read the task's AC (`backlog task view LORE-81 --plain`), **live-CLI-verify its own repro first** (build a scratch bundle with a real frontmatter'd `docs/index.md`, run `lore rename index <newname>`, confirm the claimed corruption and current exit code/error type), implement, verify, review, PR, self-merge, prune.
2. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch before merging (per the skill's step 4) — the Queue table will become empty; don't invent a next cursor, just note the queue is exhausted.
3. Run the lifecycle's step 6 independent review (`general-purpose` subagent) **after** committing the fix and its tests, **then** write the outcome into the tracker — the ordering LORE-74 (after a correction), LORE-75, LORE-80, LORE-79, and LORE-78 all followed cleanly. Keep following it.
4. Since the queue is now empty: archive this handover, write NO new one, report the campaign complete to the user with the full Resolved-table summary, and suggest `/backlog-handover init` for a fresh queue (flagging the Not-queued items above for the user's triage first).

## Critical context / traps

- **LORE-81 is the last of four rename-hardening tasks this campaign queued** (LORE-80 engine-layer, LORE-79 command-layer, LORE-78 argument-parsing-layer — all three about the *destination* id's traversal safety; LORE-81 is a different bug class: the *source* id's reserved-stem safety). Don't conflate it with the traversal cluster's fix pattern (`escapesRoot`/`assertDestinationConfined`) — the relevant precedent here is `assertNotReservedStem`, already exported from `commands/args.ts` and already used symmetrically in `supersede.ts`.
- **This campaign's live-CLI-verify-first discipline has paid off twice now** (LORE-79 found its own repro already closed by LORE-80; LORE-78 found AC#1 already substantively closed by LORE-79) — always empirically confirm LORE-81's repro is still live before assuming the fix is a simple one-line symmetry addition; check whether any of LORE-78/79/80's own changes incidentally touched `oldId` handling.
- `.repro-scratch/` keeps accumulating scratch files from every review (unchanged this session) — still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight — 26 prior sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- When live-CLI-verifying against a scratch repo, do NOT use `bun run --cwd <dir> <script>` — cd into the scratch dir first, then run `bun run <absolute-path-to-src/cli.ts> ...` with NO `--cwd` flag, and run `git status --porcelain` in the real repo immediately after every such step. The harness's Bash tool resets its own tracked cwd back to a working directory after each call when you `cd` into `/tmp` — cosmetic (the command itself still runs correctly in the scratch dir within that one call), but means every live-CLI step needs its own `cd /tmp/scratch-dir && bun run ...` prefix; `cd` does not persist to the next Bash call the way it normally would in this repo.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the feature branch** when it's the currently-checked-out one, and fully removes the LOCAL feature branch automatically too — verify with `git branch -a` + `git fetch --prune` rather than assuming a manual prune step is always required.
- No exported `parse*Args` function exists anywhere in this codebase (checked all 15+ commands during LORE-78) — every command's argument-parsing function is private and tested only via full CLI/command-runner integration tests. Don't export one just to unit-test LORE-81's fix in isolation; follow the same convention.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all four campaign sessions to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a destructive/security fix is correct — run the real CLI against a scratch repo too (this campaign's standing discipline since LORE-73's costliest miss).
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check. Run the command (or the review) first, then write the claim.
- Don't assume a task's own filed repro is still an open gap without live-CLI-verifying it first — this has been the single highest-value discipline across LORE-79 and LORE-78 both; apply it to LORE-81 too even though it's a different bug class (a prior task's incidental change could have already touched `oldId` handling).
- Don't re-derive a security/correctness-sensitive check from scratch when an existing, already-tested one fits — `assertNotReservedStem` already exists and is already exported from `commands/args.ts`; reuse it, mirroring `supersede.ts`'s own two-sided call pattern, rather than writing new reserved-stem logic.
- Don't export a private `parse*Args` function just to unit-test a fix in isolation — no precedent for this anywhere in the codebase; stick to CLI-level integration tests like every other command.
- Don't use `bun run --cwd <lore-repo-path> src/cli.ts ...` when you've already `cd`'d into a scratch directory for live-CLI verification — the `--cwd` flag wins and silently redirects the command onto the real repo.
