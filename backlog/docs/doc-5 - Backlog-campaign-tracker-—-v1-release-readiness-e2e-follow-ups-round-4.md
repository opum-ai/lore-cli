---
id: doc-5
title: Backlog campaign tracker — v1 release readiness & e2e follow-ups (round 4)
type: other
created_date: '2026-07-25 02:15'
updated_date: '2026-07-25 02:20'
---
# Backlog campaign tracker — v1 release readiness & e2e follow-ups

Round 4 of the lore backlog campaign. Round 1 (doc-1, LORE-69..95, 20 high), round 2 (doc-3, LORE-96..194, 78 medium), round 3 (doc-4, LORE-198..250, 55 low) closed the entire Codex second-opinion review (doc-2) and are all Done. This round covers the **v1-release-readiness follow-ups + e2e-testing findings** filed 2026-07-24 (LORE-253..263) — the residue after the review campaign, surfaced by shipping-readiness work, LORE-252 (Windows CI green), and a 56-concept/40-task Meridian e2e stress test.

Protocol: restore → compute the ready/conflict graph → mark the wave Dispatched → dispatch (parallel Sonnet implement + Fable review) → serialize the merge → update this tracker once more at settlement → loop until the queue is empty or blocked → write handover.

## Scope / order confirmation

- **Scope**: the 9 agent-resolvable follow-ups from LORE-253..263 (bug/enhancement polish + CI/release + the onboarding feature). The 6 non-agent-resolvable items are in "Not queued" below.
- **Order**: user confirmed **"Lowest-risk first"** on 2026-07-24 — small bug/polish fixes → CI/release → the large onboarding feature (LORE-260) last. This is the wave-builder's **tie-break only**, NOT a strict execution order (item #7 will not necessarily run in the 7th slot); the ready set is recomputed live each restore.
- All 9 queued tasks carry **zero formal Backlog dependencies** (re-verified live 2026-07-25 by YAML parse); readiness is gated purely by the live pairwise file-conflict graph + the 6-worker wave cap.

## Frontier

The "ready now" set is **always recomputed live** from `backlog/tasks/*.md` + this table at the start of every restore/wave — never trust a persisted "next wave" plan. Informational hint only: as of **wave 1 dispatch (2026-07-25)**, **4 in-flight** (258, 263, 262, 254), **5 queued/blocked-by-conflict** (259, 261, 256, 255, 260), **0 resolved**, **6 not queued**.

Live conflict edges computed at wave 1 (file-citation read, over-approximated per skill R4b):
- 258 ↔ 259 (both `src/commands/link.ts` + `tasks.ts`)
- 258 ↔ 261 (261's link-cascade option would touch `link.ts`)
- 259 ↔ 261 (same)
- 256 ↔ 263 (both `src/commands/fswrite.ts`)
- 260 ↔ 263 (both `src/commands/scaffold.ts`)
- 254 ↔ 255 (same `build-ci-config` cluster + `.github/workflows/`)
- 255 ↔ 260 (both may touch `src/cli.ts`)

## Queue (confirmed order)
| # | Issue | Cluster | Formal deps | Status | Wave | Note |
|---|---|---|---|---|---|---|
| 1 | LORE-258 | core-bundle | — | Dispatched | 1 | bug. Harmonize the 'no frontmatter mapping' non-concept warning + skipped-count across check/validate/link/sync/unlink/tasks. [src/core/bundle.ts + command loadBundle call sites] |
| 2 | LORE-259 | cmd-link/errors-output | — | To Do | — | bug. Consistent usage/error/success phrasing: missing-arg templates, misdirecting bad-id hint (points at check, should be query/graph), unexplained '(doc)'. [src/commands/link.ts, tasks.ts] |
| 3 | LORE-263 | cmd-scaffold | — | Dispatched | 1 | enhancement. Make scaffold idempotent-when-unchanged (no-op vs hard conflict); clearer --force hint when modified. [src/commands/scaffold.ts, fswrite.ts] |
| 4 | LORE-261 | cmd-meta-a | — | To Do | — | enhancement. orphans should not flag subtasks of a linked parent (parent/subtask hierarchy) — or link cascades. [src/commands/orphans.ts, reconcile-shared.ts, adapters/backlog.ts] |
| 5 | LORE-262 | core-rewrite-engine | — | Dispatched | 1 | bug. supersede/rename --rewrite-links must not silently leave a text/target mismatch when link text names the old id. [src/core/rewrite.ts, supersede.ts, rename.ts] |
| 6 | LORE-256 | cmd-crud-b (fswrite) | — | To Do | — | bug. Bounded renameSync EPERM/transient-lock retry in writeFileAtomic/writeFileNoFollow. Windows-CI-verified. [src/commands/fswrite.ts] |
| 7 | LORE-254 | build-ci-config | — | Dispatched | 1 | chore. A watch/trigger for the upstream MrLesk/Backlog.md --json release tag (>v1.48.0 containing 22a091b). Unblocks LORE-253. [.github/workflows/] |
| 8 | LORE-255 | build-ci-config | — | To Do | — | task. First-release rehearsal: npm publish --dry-run of all 6 artifacts + a first-release checklist (+ wire the dispatch-gated publish job). [.github/workflows/release.yml, docs/runbooks/release-publishing.md] |
| 9 | LORE-260 | cmd-init/agents/scaffold | — | To Do | — | enhancement (LARGE). One-command onboarding: interactive wizard by default (TTY-gated), flags for prompt-free/CI. Decision locked; may warrant an ADR. [src/commands/init.ts, agents.ts, scaffold.ts] |

## Resolved
| # | Issue | Status/date/wave | Evidence summary |
|---|---|---|---|
| — | (none yet) | | |

## Not queued — needs a human / blocked
- **LORE-253** (migrate adapter to the released --json backlog): BLOCKED on an external event — MrLesk/Backlog.md must tag a release >v1.48.0 containing commit 22a091b (PR #790). Latest tag v1.48.0 (2026-07-12) predates it by 10 commits. Not agent-resolvable until then. LORE-254 (queued) is its watch/trigger.
- **LORE-257** (make windows-latest a required check): NEEDS-HUMAN (repo-admin) — toggling a branch-protection ruleset is a human action an autonomous agent must not self-authorize (same boundary as LORE-196). Agent role is prep/verify only; the toggle is out of an agent's reach.
- **LORE-42** (lore mcp server), **LORE-43** (Confluence publish adapter), **LORE-44** (Confluence prod mirror), **LORE-45** (typed importable library): DEFERRED-v2 — post-v1 roadmap requiring product/scope decisions + a release milestone; not agent-resolvable now.

## Wave log
- 2026-07-24 — init: round-4 tracker created from LORE-253..263. 9 queued (lowest-risk-first, user-confirmed), 6 not queued (LORE-253 blocked-on-upstream, LORE-257 needs-human, LORE-42/43/44/45 deferred-v2). No waves dispatched yet — first dispatch happens at the next `/backlog-handover restore`.
- 2026-07-25 — wave 1 DISPATCHED (issues: LORE-258, LORE-263, LORE-262, LORE-254; workers: sonnet, reviewer: fable). Wave base `be730be`. Worktrees at `/Volumes/external/repos/lore.worktrees/<KEY>`, branches `feature/<KEY>`. Wave built greedily over the confirmed order under the live conflict graph above: 259 excluded (conflicts 258), 261 excluded (conflicts 258), 256 excluded (conflicts 263), 255 excluded (conflicts 254), 260 excluded (conflicts 263). Outcome recorded at settlement.
