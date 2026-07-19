---
id: doc-1
title: Backlog campaign tracker
type: other
created_date: '2026-07-19 23:15'
updated_date: '2026-07-19 23:15'
---
# Backlog campaign tracker

One issue per session. Protocol: restore → take the cursor issue → feature-branch
lifecycle → advance cursor → append session log → write handover.

## Cursor

**Next issue: LORE-67** — queue order confirmed by the user on 2026-07-19
(selected "67 first, then 61–66 (Recommended)" — LORE-67 docs-only shakes down
the campaign loop, then LORE-61 whose `step_fail` helper LORE-62/66 depend on,
then 62 → 63 → 64 → 65 → 66 by dependency and priority); do not re-ask before
taking the next item.

**Merge gate: self-merge (skill default)** — confirmed by the user on 2026-07-19
(selected "Self-merge (skill default)"): each session reviews adversarially,
opens the PR into `dev`, and merges immediately (`gh pr merge --rebase
--delete-branch`); the PR is an audit trail, not an approval gate. CI runs
post-merge on dev.

## Queue (confirmed order)

| # | Issue | Type | One-line note |
| --- | --- | --- | --- |
| 1 | LORE-67 | docs | cli-surface.md claims verified absent from source (init --force/probe/exit-5, new shorthands, check --fix, replace exit-6 gate) + 2 dead validate config knobs |
| 2 | LORE-61 | e2e | `step_fail` helper + failure-output contract (0/82 assertions inspect stderr/stdout today); incl. LORE-58 induced partial failure |
| 3 | LORE-62 | e2e | Real-binary coupling: missing-task signatures, probe exit-6 stub binaries, linked-concept rename + F1 (depends on LORE-61) |
| 4 | LORE-63 | e2e | Reconciliation value-assertions, managed-block body drift, custom status flows, .lore/config.toml surface |
| 5 | LORE-64 | e2e | LORE-46 declarative profile subsystem — zero populated-profile E2E |
| 6 | LORE-65 | e2e | Coupling mediums: field-isolated read-backs, multi-doc SET semantics, backlog-side renames/archive, commit scoping, nested checkout |
| 7 | LORE-66 | e2e | Command-surface tail + housekeeping: vacuous replace/supersede, check --json/F2, flag long-tail, pseudo-cache step (depends on LORE-61) |

## Resolved

| # | Issue | Status/date/session | Evidence summary |
| --- | --- | --- | --- |

## Not queued — needs a human / blocked

- LORE-42 (lore mcp server): deferred by recorded product decision (ADR-0004 CLI-first; milestone m-7). Un-deferring is a user decision, not a campaign step.
- LORE-43 (Confluence one-way publish adapter): deferred by recorded product decision (ADR-0016; milestone m-8).
- LORE-44 (Confluence production mirror): deferred (milestone m-9) AND blocked on LORE-43 (also deferred).
- LORE-45 (typed importable library build): deferred per ECK-alignment follow-up — its own notes say revisit ONLY if a real in-process import need appears.

## Campaign conventions (durable, verified 2026-07-19)

- Every E2E task (LORE-61..66) must verify with a full real-binary harness run:
  `docker compose -f docker/e2e/docker-compose.yml up --build` (green required,
  ~2-3 min), then ALWAYS `docker compose -f docker/e2e/docker-compose.yml down -v`.
  A green `bun test` alone is NOT sufficient evidence for harness changes.
- LORE-67 is docs-only: drive docs/ edits per the repo's lore CLI conventions
  (`lore instructions`, the lore skill) and re-verify each stale claim against
  current source before editing.
- Commits: Conventional Commits with the LORE-N scope (repo convention), plus
  the session's standard co-author/session trailers.
- `docs/.obsidian/` sits untracked in the working tree, pre-existing and
  unrelated — leave it alone.
- All seven queue tasks originate from the 2026-07-19 multi-agent E2E coverage
  audit (filed at dev @ 305efa8); each task description is self-contained with
  file:line evidence.

## Session log

- 2026-07-19 — session 0 (init): tracker created. Queue = LORE-67, 61, 62, 63,
  64, 65, 66 (user-confirmed); merge gate = self-merge (user-confirmed).
  LORE-42/43/44/45 parked as deferred-by-decision. Preconditions verified:
  `.claude/handovers/` gitignored (.gitignore:52), `archive/handovers/` exists
  and tracked, dev clean @ 305efa8, no leftover feature/* branches.
