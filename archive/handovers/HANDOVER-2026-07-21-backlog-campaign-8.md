# Handover — third backlog campaign, cursor at LORE-69 (LORE-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 2da713a`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits (about to be pushed by this same restore session) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-69 — commitBacklogFiles backlog/ scope guard does not block `..`
pathspec traversal (security-labeled). Queue order confirmed by user on
2026-07-21 (independent fixes first, the LORE-78/79/80 rename-traversal
cluster last); do not re-ask. Merge gate is self-merge (skill default,
user-confirmed 2026-07-19) — no PR-approval wait. 12-issue queue remaining,
all from a full-codebase Codex review (see backlog/docs/reviews/doc-2 for
full context/repro detail on every issue, and doc-1's Cursor/Queue/Campaign-
conventions sections for the rest).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LORE-69, Queue = 12 items, LORE-85 moved to Resolved, three new campaign conventions recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 12 tasks remaining (LORE-69, 72, 71, 76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LORE-85` fully merged (PR #71, rebase-merged) and pruned (local + remote) |
| Not queued | LORE-42/43/44/45 (deferred) plus two unfiled follow-up candidates from LORE-84 (rewriteInbound's profile gap; lore check's separate validation path) |

## Next steps

1. Run the per-issue lifecycle on **LORE-69** (`commitBacklogFiles backlog/
   scope guard does not block ".." pathspec traversal`, security-labeled):
   branch `feature/LORE-69` off `dev`, read the task's AC, implement,
   verify, review, PR, self-merge, prune. Root area: `src/state.ts`,
   `commitBacklogFiles` (line ~182-201) — the guard is `if
   (!file.startsWith(BACKLOG_DIR))` where `BACKLOG_DIR = "backlog/"` (line
   79), a **plain string-prefix check**, not real path containment. A
   pathspec like `backlog/../docs/secret.md` starts with `"backlog/"` and
   passes the check, but resolves OUTSIDE `backlog/` once normalized —
   confirmed live against real git per the task's own repro (`git add --
   ':(literal)backlog/../docs/secret.md'` resolves and commits the outside
   file).
2. **Implementation approach to verify/consider**: normalize the candidate
   path (e.g. `node:path`'s `posix.normalize`) BEFORE checking the prefix,
   and reject if the normalized form doesn't genuinely start with
   `backlog/` (watch for a sibling-prefix collision too — a path like
   `backlog-evil/x.md` also textually starts with `"backlog"` but not the
   directory `"backlog/"`; the current check's trailing slash on
   `BACKLOG_DIR` already guards against that specific case, so don't
   accidentally regress it while fixing the `..` gap). AC3 explicitly
   requires the guard's own doc comment (right above the check, already
   fairly detailed) to be corrected to accurately describe what's now
   defended against.
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LORE-72** (item #2 of the remaining queue).
4. Archive this handover to `archive/handovers/` and write the next one for
   LORE-72. Note: today's date (`2026-07-21`) already has SEVEN prior
   archived handovers (base, `-2` through `-7`) — this session's own
   archival will need suffix `-8`.

## Critical context / traps

- **This is the SECOND security-labeled task this campaign** (after
  LORE-85). The queue's remaining items include several more
  security-labeled ones (LORE-72 path traversal, LORE-71 SSRF, LORE-76/77
  symlink escapes, LORE-75 destructive file deletion) — read each task's
  own description carefully; they're all real, Codex-confirmed
  vulnerabilities with live repros, not speculative findings.
- **`.repro-scratch/` now has TWO extra files from LORE-85's security
  review** (`lore85-bypass-attempts.test.ts`, `merge-key-check.test.ts`) —
  the review agent tried to clean them up but hit a permission denial;
  they're harmless, untracked, outside any diff. Per this campaign's
  standing rule, do NOT delete `.repro-scratch/` contents without being
  asked again — the user denied that action once already, and this applies
  to the whole directory's cleanup, not just its original contents.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers** for the lifecycle's step-0 clean-tree preflight — 15 prior
  sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign. Deliberate, explicit exception to this repo's
  general "don't self-merge" convention — applies ONLY inside this
  campaign's one-issue-per-session lifecycle.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review. For
  LORE-85 (the last security task), the reviewer was told to actively try
  to construct a BYPASS, not just re-confirm the given repro, and did so
  productively (9+ adversarial variants, all caught, no false positives).
  Use the same adversarial framing for LORE-69 and any other
  security-labeled task — e.g. for a path-traversal fix, try alternate
  traversal encodings (`backlog/./../`, `backlog//../`, a symlink planted
  inside `backlog/` pointing outside, an absolute path disguised as
  relative) not just the exact given repro.
- **Timing lesson from LORE-82's session** (recorded in that session's
  handover, worth repeating): commit and push EVERY backlog CLI mutation
  (`backlog task edit`, `backlog doc update`) — including ones issued
  AFTER the review pass, like recording the review's own findings —
  BEFORE calling `gh pr merge`. This session (LORE-85) deliberately
  committed the review-notes update immediately after `backlog task edit`
  and confirmed a clean `git status` before pushing/merging, precisely to
  avoid repeating LORE-82's stray-orphaned-commit incident. Keep doing
  that going forward.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again — the user denied
  that action once already, and it now applies to review-agent-generated
  scratch files too, not just the original contents.
- Don't build a real-subprocess flush/truncation regression test around
  `Bun.spawnSync`'s own direct `stdout: "pipe"` capture — see
  `test/cli-exit-flush.test.ts` (LORE-70) for the correct pattern.
- Don't assume every merged bugfix needs a CHANGELOG.md entry — check actual
  recent precedent first (none of this campaign's fixes have added one; the
  tracker doc is this campaign's record of truth).
- Don't call `gh pr merge` while any backlog CLI mutation from the review
  pass is still uncommitted on disk — commit and verify `git status` is
  clean first (LORE-82's session hit this; LORE-85's avoided it).
