# Handover — third backlog campaign, cursor at LCLI-72 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 7692e77`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits, 0 ahead/behind `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-72 — `lore new --template` allows path traversal to read
arbitrary files (security-labeled, third security task this campaign). Queue
order confirmed by user on 2026-07-21 (independent fixes first, the
LCLI-78/79/80 rename-traversal cluster last); do not re-ask. Merge gate is
self-merge (skill default, user-confirmed 2026-07-19) — no PR-approval wait.
11-issue queue remaining, all from a full-codebase Codex review (see
backlog/docs/reviews/doc-2 for full context/repro detail on every issue, and
doc-1's Cursor/Queue/Campaign-conventions sections for the rest).

CRITICAL: read doc-1's newest campaign convention (added this session, LCLI-69)
about validate-vs-execute divergence at exec/argv boundaries BEFORE
implementing the fix — it applies directly to LCLI-72's own file-path
resolution and to every other remaining security-labeled item.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-72, Queue = 11 items, LCLI-69 moved to Resolved with the review-caught bypass documented, two new campaign conventions recorded, one new Not-queued follow-up filed) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 11 tasks remaining (LCLI-72, 71, 76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LCLI-69` fully merged (PR #72, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune`) |
| Not queued | LCLI-42/43/44/45 (deferred) plus three unfiled follow-up candidates: two from LCLI-84 (rewriteInbound's profile gap; lore check's separate validation path), one new from LCLI-69 (commitBacklogFiles's guard is POSIX-only via `posix.normalize`, not currently reachable but not a designed barrier either) |

## Next steps

1. Run the per-issue lifecycle on **LCLI-72** (`lore new --template` path
   traversal, security-labeled): branch `feature/LCLI-72` off `dev`, read the
   task's AC, implement, verify, review, PR, self-merge, prune. The task's own
   repro: `lore new adr "Test" --template ../../../../../../tmp/outside_secret
   --out docs/adr/test.md` reads `/tmp/outside_secret.md` and copies its exact
   bytes into the generated concept — the `--template` flag value is
   interpolated into a path under `.lore/templates/` with no basename/
   traversal validation at all. Find the exact code site (search
   `src/commands/new.ts` or wherever `--template` is consumed) before
   assuming the task's own file:line references are still accurate — this
   campaign's standing discipline (re-verify every task's premise against
   current source, not the filing task's prose).
2. **Read LCLI-69's newly-recorded campaign convention (doc-1, Campaign
   conventions section, "CRITICAL for every remaining security-labeled task")
   BEFORE designing the fix.** LCLI-69's first fix attempt (normalize-then-
   prefix-check) looked complete and passed self-review, but an independent
   adversarial reviewer found a real bypass: an embedded NUL byte passed
   `posix.normalize`'s check unchanged (Node doesn't treat a NUL-containing
   segment as `..`) but got silently truncated at the `Bun.spawn` argv/exec
   boundary, so the process that actually used the path saw a different,
   shorter string than what was validated. LCLI-72's own fix will almost
   certainly build a filesystem path from `--template`'s value (likely via
   `node:path` + `Bun.file`/`readFileSync`) — apply the same scrutiny: does
   whatever consumes the validated path (a `Bun.file()` read, an `fs` call)
   get EXACTLY the string that was validated, with no boundary that could
   reinterpret/truncate it differently? A basename-only check (AC1's "no `..`
   segments") plus an absolute-path rejection (AC2) is the likely fix shape,
   but verify it holds against the same categories LCLI-69 needed: `.`/`..`
   variants, doubled slashes, NUL bytes, absolute paths, and — per LCLI-69's
   flagged-but-unfixed Windows gap — consider whether `--template` could ever
   carry a backslash on a Windows checkout (this repo does ship a Windows CI/
   release matrix).
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LCLI-71** (item #2 of the remaining queue).
4. Archive this handover to `archive/handovers/` and write the next one for
   LCLI-71. Note: today's date (`2026-07-21`) already has EIGHT prior archived
   handovers (base, `-2` through `-8`) — this session's own archival will need
   suffix `-9`.

## Critical context / traps

- **This is the THIRD security-labeled task this campaign** (after LCLI-85,
  LCLI-69). LCLI-69's independent review caught a real, live, exploitable
  bypass of the FIRST fix attempt before merge — self-review alone had missed
  it. Do not treat the lifecycle's step-6 review as a formality for any
  remaining security task (LCLI-71 SSRF, LCLI-72 this session, LCLI-76/77
  symlink escapes, LCLI-75 destructive deletion) — explicitly ask the
  reviewer to try to construct a bypass, and expect it might actually find
  one; if it does, fix it and re-review before opening the PR, same as this
  session did.
- **`.repro-scratch/` now has several extra files from LCLI-69's security
  review** (`lore69-nul-bypass.ts`, `lore69-nul-bypass-verbose.ts`,
  `lore69-mixed-array.ts`, `nul-truncation-generic.js`, plus LCLI-85's
  earlier `lore85-bypass-attempts.test.ts`, `merge-key-check.test.ts`) — all
  harmless, untracked, outside any diff. Per this campaign's standing rule,
  do NOT delete `.repro-scratch/` contents without being asked again — the
  user denied that action once already, and this applies to the whole
  directory's cleanup, not just its original contents.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers** for the lifecycle's step-0 clean-tree preflight — 16 prior
  sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign. Deliberate, explicit exception to this repo's
  general "don't self-merge" convention — applies ONLY inside this
  campaign's one-issue-per-session lifecycle.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review.
- **Timing lesson from LCLI-82's session** (recorded in that session's
  handover, worth repeating): commit and push EVERY backlog CLI mutation
  (`backlog task edit`, `backlog doc update`) — including ones issued
  AFTER the review pass — BEFORE calling `gh pr merge`. This session (LCLI-69)
  committed the review-fix, the review-finding task notes, and the amended
  tracker entry as separate, immediately-verified-clean commits before
  pushing/merging.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the feature
  branch** when it's the currently-checked-out one — this session's
  post-merge `git checkout dev` reported "Already on 'dev'" and
  `git branch -d feature/LCLI-69` reported "not found" because `gh` had
  already handled both. Not an error; just don't be alarmed if step 9/10 of
  the lifecycle report "nothing to do" — verify with `git branch -a` +
  `git fetch --prune` instead of assuming something went wrong.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again — the user denied
  that action once already, and it now applies to review-agent-generated
  scratch files too, not just the original contents.
- Don't assume a fix that passes self-review and its own tests is done on a
  security-labeled task — LCLI-69's first attempt looked complete and still
  had a real, live bypass, caught only by the independent adversarial review
  step. Budget for that step to actually find something and require a second
  round of fix + re-verify + re-commit before the PR opens.
- Don't validate a string in one representation and then use a DIFFERENT
  representation (or let it cross a boundary — exec/argv, FFI, serialization
  — that could reinterpret it) downstream without re-checking that the
  boundary preserves what was validated. See doc-1's new "CRITICAL" campaign
  convention for the general question to ask.
- Don't assume `gh pr merge --delete-branch` leaves you on the feature
  branch — it switches you to the base branch automatically when that's the
  currently-checked-out one.
