# Handover — third backlog campaign, cursor at LORE-77 (LORE-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ fd128e2`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits, 0 ahead/behind `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-77 — lore init follows pre-existing symlinks at scaffold paths,
escaping the repo root (security-labeled, sixth security task this campaign,
the SIBLING of just-resolved LORE-76). Queue order confirmed by user on
2026-07-21 (independent fixes first, the LORE-78/79/80 rename-traversal
cluster last); do not re-ask. Merge gate is self-merge (skill default,
user-confirmed 2026-07-19) — no PR-approval wait. 8-issue queue remaining, all
from a full-codebase Codex review (see backlog/docs/reviews/doc-2 for full
context/repro detail on every issue, and doc-1's Cursor/Queue/Campaign-
conventions sections for the rest).

CRITICAL: read doc-1's LORE-76 campaign conventions before implementing —
LORE-76 just added `assertNoSymlinkInPath` to src/commands/fswrite.ts for
EXACTLY this same vulnerability class in `lore scaffold`; LORE-77 is very
likely a matter of EXPORTING and REUSING that same function in init.ts's own
write loops, not writing a new one from scratch.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LORE-77, Queue = 8 items, LORE-76 moved to Resolved with its clean review documented, three new campaign conventions recorded, one new Not-queued follow-up) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 8 tasks remaining (LORE-77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LORE-76` fully merged (PR #75, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune`) |
| Not queued | LORE-42/43/44/45 (deferred) plus six unfiled follow-up candidates: two from LORE-84, one from LORE-69, two from LORE-72, one from LORE-76 (a narrow, explicitly non-blocking TOCTOU gap in `writeAllOrRollback`'s `--force` branch) |

## Next steps

1. Run the per-issue lifecycle on **LORE-77** (`lore init` follows
   pre-existing symlinks, security-labeled): branch `feature/LORE-77` off
   `dev`, read the task's AC, implement, verify, review, PR, self-merge,
   prune. Grounded code pointers (verified this session):
   - `src/commands/init.ts:60-61` — `for (const dir of plan.dirs) {
     ensureDir(join(options.root, dir), dir); }` — plain `ensureDir` calls,
     NOT routed through `writeAllOrRollback` (confirmed by LORE-76's own
     independent review, which grepped every `ensureDir` call site directly).
     `plan.dirs` (from `core/scaffold.ts`'s `buildScaffold`) is `[".lore",
     ".lore/schemas", ".lore/templates", ".lore/cache", "docs"]` — more
     entries than just the task's own named examples ("docs, .lore, or
     .lore/schemas"), so the fix needs to cover the WHOLE `plan.dirs` list
     generically, not special-case three hardcoded names.
   - `src/commands/init.ts:66-72` — `for (const file of plan.files) {
     createIfAbsent(...) }` — the file-write loop, same pattern.
   - `src/commands/fswrite.ts` — **LORE-76 just added `assertNoSymlinkInPath`
     here** (a private, unexported function) specifically for this exact
     vulnerability class in `writeAllOrRollback`. The most direct, lowest-risk
     fix for LORE-77 is almost certainly: export `assertNoSymlinkInPath` from
     `fswrite.ts`, then call it in `init.ts`'s own two loops (once per `dir`,
     once per `file.path`) — mirroring exactly how `writeAllOrRollback` calls
     it, reusing already-reviewed, already-tested logic rather than writing a
     near-duplicate. Read `assertNoSymlinkInPath`'s current doc comment and
     implementation in full before deciding whether to reuse as-is or adapt.
2. **AC2** needs a test in whatever file covers `init.ts` (likely
   `test/init.test.ts` — the task's filing notes reference `test/init.test.ts:218`
   as already having ONE symlink test, but only for a symlink occupying the
   FINAL scaffold-file path, not a symlinked scaffold DIRECTORY — that's the
   actual gap AC1 names. Read that existing test first for conventions, then
   add the missing directory-symlink case (mirroring LORE-76's own two new
   test cases in `test/consumer-scaffold.test.ts` for a close, proven pattern).
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LORE-73** (item #2 of the remaining queue).
4. Archive this handover to `archive/handovers/` and write the next one for
   LORE-73. Note: today's date (`2026-07-21`) already has ELEVEN prior
   archived handovers (base, `-2` through `-11`) — this session's own
   archival will need suffix `-12`.

## Critical context / traps

- **This is the SIXTH security-labeled task this campaign**, and the direct
  sibling of LORE-76 (just resolved) — same vulnerability class, different
  command. LORE-76's independent review was the FIRST review this campaign
  that found zero bypass on the first pass (no fix-and-re-review round
  needed) — a good sign the established pattern (`lstatSync`-per-segment,
  scoped to the actual call site) is solid. Still budget for a real review
  round on LORE-77 rather than assuming a rubber stamp, since it's a
  DIFFERENT call site (`init.ts`'s own loops, not `writeAllOrRollback`) even
  if it reuses the same underlying check.
- **`.repro-scratch/` keeps accumulating scratch files from every security
  review** (LORE-85, LORE-69, LORE-72, LORE-71, LORE-76 all left files
  there) — all harmless, untracked, outside any diff. Per this campaign's
  standing rule, do NOT delete `.repro-scratch/` contents without being
  asked again.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers** for the lifecycle's step-0 clean-tree preflight — 19 prior
  sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review.
- **A reviewer-suggested "nearly free" improvement using an existing helper
  is not automatically in-task** — check whether adopting it touches OTHER
  already-tested invariants first (LORE-76's own TOCTOU-follow-up decision).
  Applies in reverse here too: reusing `assertNoSymlinkInPath` for LORE-77
  IS the right move (it's the task's own core fix, not a bonus improvement),
  but still re-verify it behaves correctly against `init.ts`'s DIFFERENT
  idempotency contract (never-clobber, not all-or-nothing rollback) before
  assuming a drop-in reuse needs no adaptation.
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
  something and require a follow-up round before the PR opens (even though
  LORE-76's review found nothing, that was still real work well spent, not a
  wasted step to skip next time).
- Don't silently expand a security task's scope to fix every adjacent gap an
  adversarial review surfaces, and don't silently ignore those findings
  either — same code + precedented fix → fix in-task; genuinely separate
  vector, OR a fix that would touch other already-tested invariants →
  document as a Not-queued follow-up, never silent either way.
- Don't write a near-duplicate symlink-guard function when LORE-76 already
  added one to `fswrite.ts` for exactly this vulnerability class — export
  and reuse it.
- Don't assume `gh pr merge --delete-branch` leaves you on the feature
  branch — it switches to the base branch automatically.
