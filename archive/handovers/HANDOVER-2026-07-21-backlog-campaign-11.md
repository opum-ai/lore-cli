# Handover — third backlog campaign, cursor at LORE-76 (LORE-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 2a671b0`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits, 0 ahead/behind `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-76 — lore scaffold --force writes follow symlinks, escaping the
repo root (security-labeled, fifth security task this campaign). Queue order
confirmed by user on 2026-07-21 (independent fixes first, the LORE-78/79/80
rename-traversal cluster last); do not re-ask. Merge gate is self-merge (skill
default, user-confirmed 2026-07-19) — no PR-approval wait. 9-issue queue
remaining, all from a full-codebase Codex review (see backlog/docs/reviews/doc-2
for full context/repro detail on every issue, and doc-1's Cursor/Queue/
Campaign-conventions sections for the rest).

CRITICAL: read doc-1's newest campaign conventions (added LORE-69/71/72,
2026-07-21) before implementing — cross-platform/exec-boundary validation
gaps, how to decide whether an adversarial review's out-of-scope finding
belongs in-task vs. a documented follow-up, and sharing one try/catch between
a new IO seam and an old one it sits beside.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LORE-76, Queue = 9 items, LORE-71 moved to Resolved with its review findings documented, three new campaign conventions recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 9 tasks remaining (LORE-76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LORE-71` fully merged (PR #74, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune`) |
| Not queued | LORE-42/43/44/45 (deferred) plus five unfiled follow-up candidates: two from LORE-84, one from LORE-69, two from LORE-72 (a symlink-read gap in `lore new --template`, DIRECTLY RELEVANT to this session's cursor issue — see below; a profile-declared-template traversal, deliberately excluded) |

## Next steps

1. Run the per-issue lifecycle on **LORE-76** (`lore scaffold --force` writes
   follow symlinks, security-labeled): branch `feature/LORE-76` off `dev`,
   read the task's AC, implement, verify, review, PR, self-merge, prune.
   Grounded code pointers (verified this session, not just the filing task's
   own prose):
   - `src/commands/scaffold.ts:20,114` — the preflight uses
     `existsSync(abs) && !statSync(abs).isDirectory()` — `statSync` FOLLOWS
     symlinks (the task's exact concern). Read the surrounding function to
     understand what this preflight decides (create vs. skip vs. conflict)
     before changing it.
   - `src/commands/fswrite.ts` — already imports BOTH `statSync`-adjacent
     helpers AND `lstatSync` (used by `existingIsRegularFile` at line ~153)
     — the read-path convention (symlink-safe via `lstatSync`) already has
     SOME precedent in this exact file; look at how `existingIsRegularFile`
     uses `lstatSync` as a template for the write-path fix, and read
     `writeAllOrRollback` (~line 240) and `ensureDir` (~line 34) fully, since
     those are almost certainly the actual write/mkdir call sites the task's
     AC1 wants guarded (checking a symlink at "any ancestor of the target
     path or the final target itself").
   - `src/core/bundle.ts` and `src/commands/replace.ts` are the task's own
     cited READ-path precedent (`lstatSync(...).isSymbolicLink()`, skip/warn)
     — already used as a template once this campaign, for LORE-72's (out-of-
     scope, documented-not-fixed) `.lore/templates/` symlink-read finding.
     Read that precedent's exact shape before designing this write-path
     guard — LORE-76 is the WRITE-path counterpart in the same escape class.
2. **Directly relevant prior finding**: LORE-72's independent review (this
   same campaign, same day) found a symlink-READ gap in `lore new
   --template` and confirmed it is NOT covered by LORE-76/77 (those are
   specifically WRITE-path) — but now that you're actually working LORE-76,
   re-read that Not-queued entry (doc-1) once more: if LORE-76's fix
   introduces or touches a shared symlink-detection helper, consider (but do
   NOT silently expand scope to fix) whether it's reusable for that
   documented follow-up — a note in the task, not an automatic scope pull-in.
3. **AC2** needs a test with a REAL symlink (`symlinkSync` from `node:fs`,
   already imported in `test/check.test.ts` for an unrelated LORE-71-era
   fixture — search other test files for existing `symlinkSync` usage
   patterns in this repo first) — one case for a symlinked ANCESTOR
   directory in the scaffold target path, one for a symlinked FINAL target,
   both under `--force`, both refused.
4. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LORE-77** (item #2 of the remaining queue — the SIBLING symlink task,
   `lore init` following pre-existing symlinks; read both LORE-76 and
   LORE-77 together now if it saves rework later, but resolve only LORE-76
   this session per the one-issue-per-session rule).
5. Archive this handover to `archive/handovers/` and write the next one for
   LORE-77. Note: today's date (`2026-07-21`) already has TEN prior archived
   handovers (base, `-2` through `-10`) — this session's own archival will
   need suffix `-11`.

## Critical context / traps

- **This is the FIFTH security-labeled task this campaign** (after LORE-85,
  LORE-69, LORE-72, LORE-71). Every one so far has had its independent
  adversarial review find SOMETHING — a live bypass (LORE-69), a real but
  out-of-scope gap (LORE-72), or a real-but-narrow classifier gap plus a
  test-coverage gap (LORE-71, via differential fuzzing). Do not treat the
  lifecycle's step-6 review as a formality for LORE-76 or LORE-77 — budget
  time for a second round of fix + re-verify + re-commit before the PR opens.
- **LORE-76 and LORE-77 are a matched pair** (write-path symlink-following:
  `scaffold --force` and `init` respectively) — similar in spirit to how
  LORE-78/79/80 are three layers of the same rename-traversal gap. Read
  LORE-77's own description now (already available) so the SAME symlink-
  detection approach can be reused/kept consistent across both sessions,
  even though only LORE-76 is resolved this session.
- **`.repro-scratch/` keeps accumulating scratch files from every security
  review** (LORE-85, LORE-69, LORE-72, LORE-71 all left files there) — all
  harmless, untracked, outside any diff. Per this campaign's standing rule,
  do NOT delete `.repro-scratch/` contents without being asked again.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers** for the lifecycle's step-0 clean-tree preflight — 18 prior
  sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review. For a
  hand-rolled classifier/parser-shaped fix (unlikely here, but LORE-71's WAS
  one), explicitly ask the reviewer to build independent differential
  verification rather than just re-reading the code — it found a real gap
  that way LORE-71 wouldn't have caught otherwise.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the feature
  branch** when it's the currently-checked-out one — `git checkout dev` /
  `git branch -d feature/<KEY>` may report "already on"/"not found" as a
  result; not an error, verify with `git branch -a` + `git fetch --prune`.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't assume a fix that passes self-review and its own tests is done on a
  security-labeled task — budget for the independent review to actually find
  something and require a follow-up round before the PR opens.
- Don't silently expand a security task's scope to fix every adjacent gap an
  adversarial review surfaces, and don't silently ignore those findings
  either — same code + precedented fix → fix in-task; genuinely separate
  vector → a documented Not-queued follow-up, never silent either way.
- Don't assume a found gap overlaps an already-queued item just because the
  titles sound similar — read the other item's actual AC before concluding
  either way (this already burned/saved LORE-72's session once).
- When a fix adds a NEW injectable IO seam beside an existing one, share ONE
  try/catch between them — a fault from the new seam needs the SAME
  classification as a fault from the old one, not a separate, easy-to-forget
  error path (LORE-71's self-caught bug: an uncaught DNS fault silently
  crashed the whole liveness probe until this was fixed).
- Don't assume `gh pr merge --delete-branch` leaves you on the feature
  branch — it switches to the base branch automatically.
