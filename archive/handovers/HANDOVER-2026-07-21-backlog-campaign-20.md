# Handover — fifth backlog campaign session, cursor at LORE-90 (fresh 8-item queue, item 1 of 8)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 6062df4`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), pushed and in sync with `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-90 — commitBacklogFiles' backlog/ containment guard uses
POSIX-only normalize, inconsistent with the project's win32 validation
convention. This is item 1 of a fresh 8-item queue (LORE-90/94/92/95/89/88/
91/93) confirmed by the user on 2026-07-21 ("Risk-ascending, sweep last
(Recommended)"); do not re-ask before taking the next item.

Read the task itself first (`backlog task view LORE-90 --plain`) — do not
trust this summary alone.

Root-cause claim to verify, not assume: `src/state.ts` imports only `posix`
from `node:path` (line ~29), and `commitBacklogFiles`'s containment guard
(around state.ts:216-217) normalizes every candidate path via
`posix.normalize(file)` before checking `startsWith(BACKLOG_DIR)`, regardless
of host OS. The task's own filing (drafted by an independent verification
agent this session, live-tested against dev HEAD c8698a2) found a payload
like `"backlog/x\pwned\..\..\outside.md"` (backslash-delimited `..`) passes
`posix.normalize` unchanged and satisfies the `backlog/` prefix check — but
also found the CONCRETE consequence today is a silent no-op, not an actual
escape: git's own `:(literal)` pathspec matching never treats `\` as a
separator either, so nothing actually gets committed outside `backlog/`
through this exact path today. Re-verify this yourself before implementing —
read current line numbers fresh, don't assume today's.

This mirrors the convention LORE-69/72/80 already established in this
codebase: validate against the actual deployment platform (this repo ships a
`windows-latest` CI matrix and a `win32-x64`/`lore.exe` release target), not
just the POSIX host running the fix. Likely fix shape (verify before
implementing): also normalize/reject via `win32.normalize` (or an equivalent
separator-agnostic check), mirroring how LORE-80's `escapesRoot` became
separator-agnostic after its own review-found backslash bypass — read
`core/rewrite.ts`'s `escapesRoot` for that precedent before designing a new
check from scratch.

Merge gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. Run the lifecycle's step 6 independent review
(general-purpose subagent) AFTER committing the fix+tests, THEN write the
outcome into the tracker — this ordering discipline has held cleanly across
every session since LORE-74; don't regress on it.

After LORE-90: advance cursor to LORE-94 (schema export test gaps + symlink
bypass), then LORE-92, LORE-95, LORE-89, LORE-88, LORE-91, LORE-93 in that
confirmed order.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LORE-90, Queue = 8 items LORE-90/94/92/95/89/88/91/93, session-log entry appended for this init) |
| Review doc | doc-2, the original full Codex second-opinion review (201 confirmed findings) — source of the campaign's first 25 queued tasks; this fresh queue's own source is 9 not-yet-filed follow-up candidates this campaign's own independent reviews accumulated across sessions 9-26 |
| Queue | 8 tasks, all `To Do`, all `bug` type, labels `backlog-campaign-followup` plus a category label each (`correctness`/`security`/`test-coverage`) |
| New tasks filed this session | LORE-88 through LORE-95 — each independently re-verified against current dev HEAD by a dedicated workflow agent (live-CLI where feasible) before filing, plus a calibration pass across all nine candidates that merged two (the Windows-drive-relative and empty/self-cancelling-newId `escapesRoot` edge cases) into one task (LORE-95) |
| Branch | `dev`, clean, pushed and in sync with `origin/dev` |
| Leftover branches/PRs | none |
| Not queued | LORE-42/43/44/45 (deferred by recorded product decisions — unchanged by this session) |

## Next steps

1. Run the per-issue lifecycle on **LORE-90** (`commitBacklogFiles`'s guard is POSIX-only): branch `feature/LORE-90` off `dev`, read the task's AC (`backlog task view LORE-90 --plain`), re-verify the root-cause claim against current `src/state.ts` (line numbers may have drifted), implement, verify, review, PR, self-merge, prune.
2. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch before merging (per the skill's step 4) — advance cursor to LORE-94.
3. Run the lifecycle's step 6 independent review (`general-purpose` subagent) **after** committing the fix and its tests, **then** write the outcome into the tracker.
4. Continue the confirmed queue order: LORE-94 → LORE-92 → LORE-95 → LORE-89 → LORE-88 → LORE-91 → LORE-93.

## Critical context / traps

- **Reused doc-1** rather than creating a new tracker doc for this fresh queue — this campaign has now run 28 sessions against the same tracker; its Resolved table (27 rows), Not-queued section, Session log, and Campaign conventions section are all load-bearing history. Don't recreate it.
- **All 8 new tasks were independently re-verified against dev HEAD before filing** (not just carried forward from stale review notes) — a dedicated Workflow ran 9 parallel verification agents (one per original candidate) plus a calibration/dedup pass. Trust the filed tasks' descriptions as current, but each task's own AC still deserves a fresh live-CLI check at pickup time, per this campaign's standing discipline (a LOT changes session to session).
- **LORE-93 (last in queue) is the largest-surface item** — 5 command files (`new.ts`, `agents.ts`, `sync.ts`, `schema.ts`, `rename.ts`) all need the same `assertNoSymlinkInPath` guard extended to their direct `ensureDir` calls. Deliberately queued last, mirroring how the just-finished campaign sequenced its own LORE-80→79→78→81 interrelated cluster.
- **LORE-91 and LORE-93 both touch `new.ts`, but at different call sites** (LORE-91: `readTemplateFile`'s template read; LORE-93: `ensureDir`'s ancestor-directory write) — don't conflate them, they're separate tasks with separate fixes, queued 7th and 8th respectively.
- **LORE-88 and LORE-89 are both LORE-84 profile-threading follow-ups but touch entirely different code paths** (LORE-88: `core/rewrite.ts`'s `rewriteInbound` engine + `rename.ts`'s `buildPostRenameGraph`; LORE-89: `check.ts`'s own independent `walkFiles`/`parseConcept` scan) — don't merge or conflate.
- **LORE-95 covers TWO edge cases in the same shared function** (`core/rewrite.ts`'s `escapesRoot`): a Windows drive-relative id (`"C:foo"`, verifiable via `node:path`'s `path.win32` pure functions on any host — no real Windows machine needed) and an empty/self-cancelling `newId` (fully testable on POSIX). Both ACs need covering, not just one.
- `.repro-scratch/` keeps accumulating scratch files from every review/verification session (unchanged this session structurally, though this session's own verification agents added 9 new `-verify/` subdirectories) — still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- When live-CLI-verifying against a scratch repo, do NOT use `bun run --cwd <dir> <script>` — cd into the scratch dir first, then run `bun run <absolute-path-to-src/cli.ts> ...` with NO `--cwd` flag, and run `git status --porcelain` in the real repo immediately after every such step.
- `gh pr merge --rebase --delete-branch` auto-switches you off the feature branch and fully removes the LOCAL feature branch automatically too — verify with `git branch -a` + `git fetch --prune` rather than assuming a manual prune step is always required.
- No exported `parse*Args` function exists anywhere in this codebase — every command's argument-parsing function is private and tested only via full CLI/command-runner integration tests. Don't export one just to unit-test a fix in isolation.
- Two files in `.claude/handovers/` — `HANDOVER-2026-07-21T105420Z.md` and `HANDOVER-2026-07-21T130922Z.md` — use a different (ISO-timestamp) naming convention and are NOT part of this campaign's topic; they appear to be artifacts of a separate, unrelated session-recovery mechanism. Leave them alone; this skill's archive step only ever touches its own `-backlog-campaign` topic file.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all 28 campaign sessions to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a destructive/security fix is correct — run the real CLI against a scratch repo too.
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check.
- Don't assume a task's own filed repro is still an open gap without live-CLI-verifying it first — this campaign's single highest-value discipline; apply it to LORE-90 even though this session's own filing agent already did a first-pass live verification (re-verify at pickup time too, since state can drift between sessions).
- Don't re-derive a security/correctness-sensitive check from scratch when an existing, already-tested one fits — check `core/rewrite.ts`'s `escapesRoot` for LORE-90's own separator-agnostic-normalize precedent before writing something new.
- Don't export a private `parse*Args` function just to unit-test a fix in isolation — no precedent for this anywhere in the codebase; stick to CLI-level integration tests like every other command.
