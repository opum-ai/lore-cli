# Handover — third backlog campaign, cursor at LCLI-84 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 02d4959`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits (about to be pushed by this same restore session) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-84 — loadBundle never uses a project's custom .lore/profile.toml.
Queue order confirmed by user on 2026-07-21 (independent fixes first, the
LCLI-78/79/80 rename-traversal cluster last); do not re-ask. Merge gate is
self-merge (skill default, user-confirmed 2026-07-19) — no PR-approval wait.
15-issue queue remaining, all from a full-codebase Codex review (see
backlog/docs/reviews/doc-2 for full context/repro detail on every issue, and
doc-1's Cursor/Queue/Campaign-conventions sections for the rest). LCLI-84 is
LARGER than recent sessions — read the Critical context section below before
starting.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-84, Queue = 15 items, LCLI-83 moved to Resolved, one new convention recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 15 tasks remaining (LCLI-84, 82, 85, 69, 72, 71, 76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LCLI-83` fully merged (PR #68, rebase-merged, commit `edc269b`) and pruned (local + remote) |
| Not queued | LCLI-42/43/44/45 — unchanged, deferred by recorded product decision |

## Next steps

1. Run the per-issue lifecycle on **LCLI-84** (`loadBundle never uses a
   project's custom .lore/profile.toml`): branch `feature/LCLI-84` off
   `dev`, read the task's AC, implement, verify, review, PR, self-merge,
   prune.
2. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LCLI-82** (item #2 of the remaining queue).
3. Archive this handover to `archive/handovers/` and write the next one for
   LCLI-82. Note: today's date (`2026-07-21`) already has FOUR prior
   archived handovers (base, `-2`, `-3`, `-4`) — this session's own
   archival will need suffix `-5`.

## Critical context / traps

- **LCLI-84 is bigger than the last several sessions** — it's not a
  single-function fix. `loadBundle`'s `LoadBundleOptions` (`src/core/
  bundle.ts`) has no `profile` field, so every command validates concept
  frontmatter against the built-in default profile even when the project
  declares a custom `.lore/profile.toml`. Confirmed via `grep -rln
  "loadBundle(" src/commands/` this session: **9 command files** call
  `loadBundle` — `context.ts`, `supersede.ts`, `graph.ts`, `rename.ts`,
  `tasks.ts`, `query.ts`, `orphans.ts`, `sync.ts`, `link.ts`. AC2 explicitly
  requires EVERY existing caller to be updated, not just `loadBundle`'s own
  signature. Read `loadBundle`'s current signature/body in `bundle.ts`
  first, and how frontmatter gets validated during parse (is validation
  even happening inside `loadBundle` today, or only later at the command
  layer? — the task's premise needs re-verification, same discipline as
  every prior campaign task). The task notes `sync.ts`/`supersede.ts`
  ALREADY call `loadProfile()` separately today but only use it for later
  serialization, never threading it into their own `loadBundle` call — that
  existing pattern (profile loaded once by the command, passed down) is
  probably the shape to extend to `loadBundle` itself and to the other 7
  callers that don't yet load a profile at all.
- **Consider whether this needs scope discussion before implementing.** If,
  on reading the code, this turns out to be a genuinely large refactor
  (e.g. touching every command's function signature, or `loadBundle`'s
  validation behavior is more entangled than the task assumes), the
  lifecycle's own guidance applies: stop and ask the user whether to add
  scope to the current task or split into follow-up work, rather than
  silently expanding — but a 9-caller mechanical thread-through is likely
  still a single, if larger, session's work. Judge once the actual diff
  shape is clear.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers.** `docs/.obsidian/` has sat untracked since before this
  campaign started — 12 prior sessions ran clean despite it.
  `.repro-scratch/` is disposable scratch from an earlier session's
  Codex-review verification work — the user explicitly declined to have it
  auto-deleted, so leave it as-is.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign (recorded in doc-1's Cursor section). Deliberate,
  explicit exception to this repo's general "don't self-merge" convention —
  applies ONLY inside this campaign's one-issue-per-session lifecycle.
- **LCLI-69..87 come from `doc-2`, not a filing task's own prose** — each
  task description is self-contained with a verified repro, but re-verify
  against current HEAD before implementing anyway (same discipline as every
  prior campaign task). This has genuinely mattered before (LCLI-61/68's
  filing hypotheses were wrong on closer inspection) — for a task this size,
  re-verifying the premise before writing code matters even more.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review. Every
  review this campaign has either found a real, fixable issue or done
  genuinely independent verification work (re-deriving repros from scratch,
  running the full suite itself, checking real-world fixtures like the
  default profile/ECK profile aren't broken) — keep using it as a real
  second pass. For a 9-caller change, the review should specifically check
  no caller was missed and no caller's existing behavior (e.g. tests
  injecting their own bundles without a profile) silently regressed.
- **New convention from this session (LCLI-83)**: a hand-rolled TOML/JSON
  grammar validator that reads known attribute keys off a table BY NAME
  with no unknown-key check will silently no-op a typo instead of erroring.
  Any nested table with a small FIXED attribute vocabulary needs an
  explicit `rejectUnknownKeys`-style gate — don't assume "reads known keys"
  implies "rejects unknown ones."

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again — the user denied
  that action once already, earlier in this campaign.
- Don't build a real-subprocess flush/truncation regression test around
  `Bun.spawnSync`'s own direct `stdout: "pipe"` capture — see
  `test/cli-exit-flush.test.ts` (LCLI-70) for the correct pattern.
- Don't assume every merged bugfix needs a CHANGELOG.md entry — check actual
  recent precedent first (LCLI-68/70/86/87/83 in this campaign lineage did
  NOT add one; the tracker doc is this campaign's record of truth).
