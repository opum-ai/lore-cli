# Handover — third backlog campaign, cursor at LCLI-78 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ b602555`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 1 unpushed commit at write time (pushed immediately after writing this) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-78 — lore rename's destination id is not validated for `..` path
segments at the ARGUMENT-PARSING layer (args.ts / parseRenameArgs), the third
and last-implemented of the interrelated rename-destination-traversal cluster
(LCLI-80→79→78→81 — LCLI-80 and LCLI-79 are both Done). Queue order confirmed
by the user on 2026-07-21 ("Use this order (Recommended)"); do not re-ask
before taking the next item. 1 issue remains in the queue after LCLI-78
(LCLI-81).

LCLI-78's own AC: "#1 The destination id argument is validated to reject `..`
path segments before it reaches command execution, with a clear usage error"
and "#2 A test covers a destination id containing `..` and asserts it is
rejected at argument-parsing time." Read the task itself first
(`backlog task view LCLI-78 --plain`) — do not trust this summary alone.

CRITICAL — apply this session's own newly-recorded campaign convention before
writing any new code: LIVE-CLI-VERIFY LCLI-78's own repro FIRST, before
assuming it's still an open gap. LCLI-79 (this session) found that LCLI-80
had ALREADY closed its own filing's exact escape at a lower layer; the same
may be true here — `commands/rename.ts` now has ITS OWN command-layer
confinement check (`assertDestinationConfined`, LCLI-79, checked immediately
after `parseRenameArgs` in `runRename`) that already rejects any `newId`
containing `..` segments with a `usage` error, exit 2, BEFORE the
argument-parsing layer LCLI-78 is scoped to even exists as a distinct check
today. Confirm empirically (`lore rename reference/orders foo/../../pwned`
against a scratch bundle) whether this already satisfies LCLI-78's AC in
substance, or whether LCLI-78 still has independent value (e.g. rejecting at
the TRUE argument-parsing boundary — `parseRenameArgs`/`args.ts` itself,
before `runRename`'s body runs at all — vs. LCLI-79's check, which runs
inside `runRename` after parsing but is still "before command execution" in
every practical sense). Read LCLI-79's task notes/final summary AND the diff
at `git log --oneline -3 -- src/commands/rename.ts src/core/rewrite.ts`
(or `git show 4970bd9`) before implementing — do not assume either way.

ALSO CRITICAL — same session's convention: when LCLI-78 needs its own
containment/segment-walk check, REUSE an existing exported one
(`escapesRoot`, exported from `core/rewrite.ts` this session for exactly
this reuse pattern) rather than re-deriving the same security-sensitive
logic a third time. If LCLI-78's own scope is genuinely just "the `newId`
positional must not contain a literal `..` segment," a simpler substring/
segment check may suffice and may not need the full `escapesRoot` (which
also handles absolute-path forms already covered by LCLI-79/80) — read the
task's own AC wording carefully; it's narrower than LCLI-79/80's own scope
("reject `..` path segments," not "confine to bundle root" generally).

Merge gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. Run the lifecycle's step 6 independent review
(general-purpose subagent) AFTER committing the fix+tests, THEN write the
outcome into the tracker — this ordering discipline has now held cleanly
across LCLI-74 (after a correction), LCLI-75, LCLI-80, and LCLI-79; don't
regress on it.

Also read the tracker's (doc-1) Not-queued section before finishing: LCLI-79's
own review flagged a MORE SEVERE, live-confirmed, out-of-scope finding this
session — a symlinked directory inside `docs/` (e.g. `docs/evil ->
/tmp/outside`) lets `lore rename` write straight through it to outside
`docs/`, bypassing every lexical id-based check LCLI-78/79/80 collectively
implement (none of them validate resolved filesystem identity, only the id
string). This mirrors LCLI-76/77's already-fixed symlink-following gap in
scaffold/init (`assertNoSymlinkInPath`) — `rename.ts` (and `new.ts`) never
got the equivalent guard. NOT in scope for LCLI-78/81 (a distinct fix, a
distinct code path) — just be aware it exists and don't let LCLI-78's own
"is this a security fix" framing get confused with it. It still needs a
human to confirm priority before it gets filed as its own task.

When live-CLI-verifying against a scratch repo, do NOT use `bun run
--cwd <dir> <script>` — cd into the scratch dir first, then run `bun run
<absolute-path-to-src/cli.ts> ...` with NO --cwd flag, and run `git status
--porcelain` in the real repo immediately after every such step. Note: the
harness's Bash tool resets its own tracked cwd back to a working directory
after each call when you `cd` into `/tmp` — this is cosmetic (the command
itself still runs correctly in the scratch dir within that one call), but
means every live-CLI step needs its own `cd /tmp/scratch-dir && bun run ...`
prefix; `cd` does not persist to the next Bash call the way it normally
would in this repo.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-78, Queue = 1 item, LCLI-79 moved to Resolved with its evidence + review outcome, two new campaign conventions recorded, two new Not-queued follow-up candidates added from LCLI-79's review) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 1 task remaining after LCLI-78 (LCLI-81), `To Do`, `bug`, `High` priority, with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean, 1 commit ahead of `origin/dev` at write time (this session's archive commit; pushed immediately after this handover is written) |
| Leftover branches/PRs | none — `feature/LCLI-79` fully merged (PR #81, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune` + `git branch -a`) |
| Not queued | LCLI-42/43/44/45 (deferred) plus all prior follow-up candidates, plus two new ones from LCLI-79: (1) a symlink-based filesystem escape in `lore rename` (see "CRITICAL" block above — the more severe one), and (2) a minor empty/self-cancelling-`newId` edge case in `escapesRoot` (renames to a hidden `docs/..md`, no security escape, just confusing) |

## Next steps

1. Run the per-issue lifecycle on **LCLI-78** (`lore rename` destination id not validated for `..` traversal at the argument-parsing layer): branch `feature/LCLI-78` off `dev`, read the task's AC (`backlog task view LCLI-78 --plain`), **live-CLI-verify its own repro first** (per this session's newly-recorded convention — LCLI-79's own check may have already substantially closed this at a different layer; confirm empirically before assuming either way), implement, verify, review, PR, self-merge, prune.
2. Read **LCLI-81** (already queued next, "renaming FROM the reserved root index") before finishing LCLI-78 — per doc-1's own recorded convention, LCLI-79/80's fixes may have already substantially reduced or reshaped LCLI-78's remaining scope.
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch before merging (per the skill's step 4), advancing the cursor to **LCLI-81** — the next (and last) queue item; re-confirm against the tracker's own Queue table at restore time in case of drift.
4. Run the lifecycle's step 6 independent review (`general-purpose` subagent) **after** committing the fix and its tests, **then** write the outcome into the tracker — the ordering LCLI-74 (after a correction), LCLI-75, LCLI-80, and LCLI-79 all followed cleanly. Keep following it.
5. Archive this handover to `archive/handovers/` and write the next one. Note: today's date (`2026-07-21`) already has SEVENTEEN prior archived handovers (base, `-2` through `-17`) — this session's own archival will need suffix `-18`.

## Critical context / traps

- **LCLI-78 is security-labeled** (`codex-review, security`), the third of the three rename-traversal-cluster layers (LCLI-80 and LCLI-79 both Done). Give it this campaign's established full-rigor treatment: live pre-fix repro against the real CLI FIRST (this session's own experience — verify whether LCLI-79/80's fixes already substantially cover it before assuming LCLI-78 is a no-op or needs full new logic), adversarial review, and reuse `core/rewrite.ts`'s exported `escapesRoot` if a new segment-walk check is genuinely needed rather than re-deriving one (per this session's newly-recorded convention).
- **This session (LCLI-79) found the underlying repro was already closed by a lower layer (LCLI-80)** but the task still had genuine independent AC value (command-layer defense-in-depth + a clearer usage-level error). Don't assume "already closed elsewhere" means "skip the task" — verify what the task's OWN AC actually asks for and whether it's still met in substance.
- **This session's review flagged a real, live-confirmed, MORE SEVERE security bypass** (the symlink-based escape, see "CRITICAL" block above) that is NOT fixed by LCLI-78/79/80's lexical id-checking approach and is out of scope for the remaining queue — don't let it block LCLI-78/81, but don't lose track of it either; it's recorded in doc-1's Not-queued section for a human to prioritize.
- `.repro-scratch/` keeps accumulating scratch files from every review (unchanged this session) — still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight — 25 prior sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- **`bun run --cwd <dir> <script>` overrides `process.cwd()` back to `<dir>`** — a live-CLI scratch-repo verification step run from inside a `mktemp -d` directory must NOT pass `--cwd <lore-repo>`; doing so silently redirects every write/delete onto the real repo instead of the scratch one. `cd` into the scratch dir first, then run `bun run <absolute-path-to-cli.ts>` with NO `--cwd` flag, and verify `git status --porcelain` on the real repo immediately after every such step, every time. **New this session**: the harness's own Bash tool resets its tracked cwd back to a repo working directory after any call that `cd`'d into `/tmp` — cosmetic (the command still ran correctly inside that one call), but means every live-CLI step needs its own full `cd /tmp/scratch-dir && bun run ...` one-liner; don't expect a bare `cd` to persist to the next Bash call the way it normally does elsewhere in this repo.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the feature branch** when it's the currently-checked-out one, and this session it also fully removed the LOCAL `feature/LCLI-79` branch automatically (no separate `git branch -d` was needed) — verify with `git branch -a` + `git fetch --prune` rather than assuming a manual prune step is always required.
- **When a new layer's containment check sits above/below an already-fixed layer, reuse its exported check rather than re-deriving it** (LCLI-79 exported `escapesRoot` from `core/rewrite.ts` this session specifically for this). Check whether it already fits before writing new segment-walk logic for LCLI-78/81.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a destructive/security fix is correct — run the real CLI against a scratch repo too (this campaign's standing discipline since LCLI-73's costliest miss).
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check. Run the command (or the review) first, then write the claim.
- Don't assume a task's own filed repro is still an open gap — LCLI-79's own filing's exact escape was already closed by LCLI-80's engine-layer fix by the time LCLI-79 was picked up; live-CLI-verify before assuming either way (new this session, directly relevant to LCLI-78 next).
- Don't re-derive a security-sensitive segment-walk/containment check from scratch when an existing, already-review-tested one might fit — reuse `core/rewrite.ts`'s exported `escapesRoot` (new this session) rather than writing a fourth copy of similar logic.
- Don't use `bun run --cwd <lore-repo-path> src/cli.ts ...` when you've already `cd`'d into a scratch directory for live-CLI verification — the `--cwd` flag wins and silently redirects the command onto the real repo. `cd` into the scratch dir, then invoke `bun run <absolute-path-to-cli.ts>` with no `--cwd` at all — and expect to repeat the `cd` prefix on every single Bash call, since this session's harness reset cwd back to a repo directory between calls.
- Don't assume `gh pr merge --delete-branch` leaves you on the feature branch, or that a separate local `git branch -d` is always needed — this session it cleaned up both remote AND local copies automatically.
