# Handover — third backlog campaign, cursor at LCLI-82 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ d249584`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits (about to be pushed by this same restore session) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-82 — loadBundle silently skips unreadable directories, letting
rename/supersede commit against an incomplete graph. Queue order confirmed by
user on 2026-07-21 (independent fixes first, the LCLI-78/79/80 rename-
traversal cluster last); do not re-ask. Merge gate is self-merge (skill
default, user-confirmed 2026-07-19) — no PR-approval wait. 14-issue queue
remaining, all from a full-codebase Codex review (see backlog/docs/reviews/
doc-2 for full context/repro detail on every issue, and doc-1's Cursor/Queue/
Campaign-conventions sections for the rest). LCLI-82 is closely related to
LCLI-84 (just resolved) — both touch loadBundle/its callers.
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-82, Queue = 14 items, LCLI-84 moved to Resolved, two new campaign conventions recorded, two follow-up candidates flagged in Not-queued) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 14 tasks remaining (LCLI-82, 85, 69, 72, 71, 76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LCLI-84` fully merged (PR #69, rebase-merged, commit `ea7c8e8`) and pruned (local + remote) |
| Not queued | LCLI-42/43/44/45 (deferred by recorded product decision) plus **two new, unfiled follow-up candidates from LCLI-84** (see below) |

## Next steps

1. Run the per-issue lifecycle on **LCLI-82** (`loadBundle silently skips
   unreadable directories, letting rename/supersede commit against an
   incomplete graph`): branch `feature/LCLI-82` off `dev`, read the task's
   AC, implement, verify, review, PR, self-merge, prune. Root area:
   `walkFiles`/`walkMarkdown` in `src/core/bundle.ts` already warns (via
   `WarningCollector`) when a nested subdirectory is unreadable — trace how
   that warning currently reaches `rename.ts`/`supersede.ts`'s command
   layer, and whether there's already a mechanism to detect "did any
   warning of THIS specific kind occur" (vs. just flushing warnings to
   stderr for display) that AC1 can hook into, or whether one needs adding.
2. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LCLI-85** (item #2 of the remaining queue).
3. Archive this handover to `archive/handovers/` and write the next one for
   LCLI-85. Note: today's date (`2026-07-21`) already has FIVE prior
   archived handovers (base, `-2` through `-5`) — this session's own
   archival will need suffix `-6`.

## Critical context / traps

- **LCLI-82 and the just-resolved LCLI-84 are closely related** — both are
  about `loadBundle`'s behavior and its command-layer callers. LCLI-84 just
  threaded a `profile` option through all 9 `loadBundle` callers
  (`context`/`supersede`/`graph`/`rename`/`tasks`/`query`/`orphans`/`sync`/
  `link`) — re-read that diff/session's notes (`git show
  feature/LCLI-84` is now merged into `dev`, or read the Resolved-table
  row for LCLI-84 in doc-1) before starting LCLI-82, since the two tasks
  may share code paths worth being consistent with (e.g. if LCLI-82 needs
  its own new `WarningCollector`-derived signal threaded through the same
  9 (or a subset of) callers, follow the same reuse-don't-double-load
  discipline LCLI-84 established).
- **Two new, unfiled follow-up candidates were recorded in doc-1's
  Not-queued section this session** (from LCLI-84, sharpened by
  independent review): (1) `core/rewrite.ts`'s `rewriteInbound` still
  serializes with the default profile even after LCLI-84's fix, creating a
  NEW risk — `lore rename` can now pass `loadBundle`'s initial validation
  but throw mid-operation inside `buildPostRenameGraph`'s still-default
  re-parse, specifically when a custom profile REDEFINES an existing
  default type name (e.g. `Story`) with different required fields; (2)
  `lore check` validates via its own separate `parseConcept`/`walkFiles`
  path, never `loadBundle`, so it's untouched by LCLI-84's fix too — a
  distinct code path with the same underlying symptom. Neither has been
  filed as a real backlog task (no live user turn was available to confirm
  priority/scope) — if a live user turn becomes available in a future
  session, consider surfacing these for a filing decision.
- **Three queued issues are one gap at three layers** (see doc-1's Campaign
  conventions): LCLI-78 (arg-parsing), LCLI-79 (rename command), LCLI-80
  (shared `rewriteInbound` engine) all describe `lore rename`'s destination
  path never being confined to `docs/`. Queued last (now #11-13 of the
  remaining queue) intentionally — LCLI-80 last so its containment fix is
  available before/while working the other two. Read all three before
  starting any one. Note: since LCLI-80 also touches `rewriteInbound`, its
  session may be a natural moment to reconsider the follow-up candidate #1
  above (both concern `rewriteInbound`'s gaps), though they are still
  distinct bugs — don't conflate them.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers.** `docs/.obsidian/` has sat untracked since before this
  campaign started — 13 prior sessions ran clean despite it.
  `.repro-scratch/` is disposable scratch from an earlier session's
  Codex-review verification work — the user explicitly declined to have it
  auto-deleted, so leave it as-is.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign. Deliberate, explicit exception to this repo's
  general "don't self-merge" convention — applies ONLY inside this
  campaign's one-issue-per-session lifecycle.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review. LCLI-84's
  review (the largest, riskiest change so far this campaign) found a real,
  substantive refinement (the type-collision risk above) that self-review
  had missed entirely — keep using it as a genuine second pass, especially
  for any task that touches shared code paths across multiple callers.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again — the user denied
  that action once already, earlier in this campaign.
- Don't build a real-subprocess flush/truncation regression test around
  `Bun.spawnSync`'s own direct `stdout: "pipe"` capture — see
  `test/cli-exit-flush.test.ts` (LCLI-70) for the correct pattern.
- Don't assume every merged bugfix needs a CHANGELOG.md entry — check actual
  recent precedent first (none of LCLI-68/70/83/84/86/87 added one; the
  tracker doc is this campaign's record of truth).
- When a fix threads a new option through many callers, check each caller
  individually for a pre-existing, deliberately-ordered side effect before
  mechanically repeating the same edit (LCLI-84's `sync.ts` had one) —
  don't assume all callers are interchangeable just because their
  `loadBundle`/similar call sites look identical at first glance.
