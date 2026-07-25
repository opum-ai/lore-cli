---
id: doc-6
title: >-
  Backlog campaign tracker — post-round-4 review residue & release hardening
  (round 5)
type: other
created_date: '2026-07-25 23:20'
updated_date: '2026-07-25 23:21'
---
# Backlog campaign tracker — post-round-4 review residue & release hardening

Round 5 of the lore backlog campaign. Rounds 1–3 (doc-1 / doc-3 / doc-4, LORE-69..250) closed the entire Codex second-opinion review (doc-2). Round 4 (doc-5, LORE-253..264) closed the v1-release-readiness and e2e follow-ups — **complete, queue empty**.

This round is the **residue of round 4's own review gate**: three defects its reviewers found in code they were reviewing but which were deliberately out of scope for the task that surfaced them, plus the one security exposure round 4 documented and never fixed. It is a **small round** — 4 items, 2 waves at most.

Protocol: restore → compute the ready/conflict graph → mark the wave Dispatched → dispatch (parallel Sonnet implement + reviewer gate) → serialize the merge → update this tracker once more at settlement → loop until the queue is empty or blocked → write handover.

## Scope / order confirmation

- **Scope**: 4 agent-resolvable items — LORE-265, LORE-267, LORE-268, LORE-266. The 6 non-agent-resolvable items are in "Not queued" below.
- **Order**: user confirmed **"265 → 267 → 266"** on 2026-07-25 (lowest-risk-first: docs-only → one-line colour fix → the security-relevant coverage gap last, since its AC#3 sweep has the widest possible footprint). **LORE-268 was filed after that confirmation** at the user's explicit instruction ("file it as a task, queue it") and is slotted third — it is disjoint from everything, so its position only affects which wave it rides in, not correctness. Effective order: **265 → 267 → 268 → 266**.
- This is the wave-builder's **tie-break only**, NOT a strict execution order; the ready set is recomputed live each restore.
- All 4 queued tasks carry **zero formal Backlog dependencies** (verified live 2026-07-25); readiness is gated purely by the live pairwise file-conflict graph.

## Frontier

The "ready now" set is **always recomputed live** from `backlog/tasks/*.md` + this table at the start of every restore/wave — never trust a persisted "next wave" plan. Informational hint only: as of **init (2026-07-25)**, **4 queued and ready**, **0 resolved**, **6 not queued**. Baseline at init: `dev` @ `7df940c`, clean; `bun test` **2176 pass / 0 fail**; `lore check` **40 files, 0 errors, 0 warnings**; docker e2e **302 / 0**.

> **⛔ CARRIED-OVER BLOCKER — needs a human before this round runs.** **Fable 5 is over its monthly spend limit** (re-probed 2026-07-25; a trivial agent fails immediately with "You've hit your monthly spend limit"). The campaign design uses Fable as the review gate. Round 4's waves 2–3, every fix cycle, and all three integration reviews ran on **Opus** by the user's explicit choice — which preserved the property that matters (an independent adversarial reviewer that is not the implementer) at materially higher cost than the design assumes. **Confirm the reviewer model at the first restore; do not silently spend Opus again.**

Live conflict edges as computed at init (file-citation read, over-approximated per skill R4b) — **recompute, do not trust**:
- **LORE-266 ↔ LORE-267 CONFLICT.** Both touch `src/commands/agents.ts` **and** `test/agents.test.ts`. This is the collateral-test-file vector, visible up front for once. They cannot share a wave.
- **LORE-265** is docs-only (`docs/adr/0009-story-task-coupling-reconciliation.md`) → disjoint from all three.
- **LORE-268** touches `.github/workflows/release.yml`, `test/release-workflow.test.ts`, `docs/runbooks/release-publishing.md` → disjoint from all three.
- LORE-266's **AC#3** ("any other multi-target pre-write sweep with the same gap") may pull in `src/commands/rename.ts` and `src/commands/sync.ts` (both call `assertNoSymlinkInAnyPath`, verified at init) plus `test/rename.test.ts` / `test/sync.test.ts`. That widens its footprint but does not create a new edge against the current queue.
- **Known accepted shared-file edge: `CHANGELOG.md`.** Round 4's process fix requires every worker with a user-visible change to add an `[Unreleased]` entry, so wave-mates collide there by construction. Round 4 proved this resolves cleanly when entries land in different sections, and the **serial merge queue is the backstop**. Do not "fix" it by dropping the CHANGELOG requirement — that gap recurred in two consecutive waves and cost two follow-up branches.

Likely shape: **wave 1 = {265, 267, 268}**, **wave 2 = {266}**.

## Queue (confirmed order)
| # | Issue | Cluster | Formal deps | Status | Wave | Note |
|---|---|---|---|---|---|---|
| 1 | LORE-265 | docs-drift / cmd-meta-a | — | To Do | — | bug (docs-only). ADR-0009 §2 misdescribes how `lore orphans` finds unowned tasks: claims a `backlog search --json` call `orphans.ts` has **never** made, and omits the parent-chain clause LORE-261 added. One inaccuracy is pre-existing, one is new. [docs/adr/0009-story-task-coupling-reconciliation.md] |
| 2 | LORE-267 | cli-ux / cmd-crud-a | — | To Do | — | bug (tiny). `lore agents` paints a `protected` bridge file **green** (two-way `unchanged ? dim : green` at `agents.ts:214`) while `lore init` paints the same action **yellow**. `protected` means the bridge is STALE and needs `--force`, so green reads as success. [src/commands/agents.ts, test/agents.test.ts] |
| 3 | LORE-268 | build-ci-config / security | — | To Do | — | task (medium). Harden the publish job: npm Trusted Publishing pins repo + workflow **filename, not a ref**, and the job is `workflow_dispatch`-reachable on **any** ref — so a branch carrying a guard-stripped `release.yml` defeats every in-workflow guard. Needs an **out-of-file** control (GitHub Environment). Has a repo-admin half the agent must not self-authorize. [.github/workflows/release.yml, test/release-workflow.test.ts, docs/runbooks/release-publishing.md] |
| 4 | LORE-266 | security / test-coverage | — | To Do | — | bug (security-relevant). The pre-write symlink sweep `assertNoSymlinkInAnyPath` (the LORE-93 AC#5 invariant) has **zero test coverage** — deleting it fails no test, on `dev` as well as on any branch. `ensureDir`'s reactive per-call guard masks it in the single-target case. AC#3 sweeps the other call sites (`rename.ts`, `sync.ts`). [src/commands/agents.ts, src/commands/fswrite.ts, test/agents.test.ts] |

## Resolved
| # | Issue | Status/date/wave | Evidence summary |
|---|---|---|---|

## Not queued — needs a human / blocked
- **LORE-253** (migrate adapter to the released `--json` backlog): BLOCKED on an external event — MrLesk/Backlog.md must tag a release containing commit `22a091b` (PR #790). **Re-verified at init 2026-07-25**: latest upstream tag is still `v1.48.0` (2026-07-12), and LORE-254's daily watcher ran clean at 07:04Z that day and correctly opened no issue. **LORE-254 is its live trigger** — when the qualifying tag appears, a one-time `upstream-watch` GitHub issue naming LORE-253 is opened automatically. Check `gh issue list` at each restore.
- **LORE-257** (make windows-latest a required check): NEEDS-HUMAN (repo-admin) — toggling a branch-protection ruleset is a human action an autonomous agent must not self-authorize (same boundary as LORE-196). Agent role is prep/verify only. **Note**: LORE-268 has a related repo-admin half; if the user is doing repo-settings work anyway, these two pair naturally.
- **LORE-42** (lore mcp server), **LORE-43** (Confluence publish adapter), **LORE-44** (Confluence prod mirror), **LORE-45** (typed importable library): DEFERRED-v2 — post-v1 roadmap requiring product/scope decisions + a release milestone.

## Wave log
- 2026-07-25 — **init**: round-5 tracker created. Inventory found 10 non-terminal tasks: 4 agent-resolvable (queued), 6 not queued. Three of the four queued items (LORE-265/266/267) were **filed by round 4's own review gate** — each a real defect a reviewer found in code it was reviewing, deliberately kept out of the reviewed diff's scope. The fourth (LORE-268) was filed at init from round 4's documented-but-unfixed LORE-255 publish exposure, on the user's explicit instruction to queue rather than merely carry it forward.
  - **Baseline verified at init, not assumed**: `dev` @ `7df940c` clean, no worktrees, no `feature/*` branches, no open PRs; `bun test` 2176/0; `lore check` 40 files 0/0.
  - **Carried-over open blocker**: Fable 5 over its monthly spend limit — the reviewer model must be confirmed at the first restore.
  - **Carried-over lessons from round 4, load-bearing for this round:**
    1. **Every worker prompt must carry the `[Unreleased]` CHANGELOG requirement explicitly** for any user-visible change. The repo encodes the rule (`.github/PULL_REQUEST_TEMPLATE.md` checkbox, `docs/runbooks/dev-kickoff.md` step 6) but workers dispatched into bare worktrees never read either file. The gap recurred in **both** of round 4's waves and cost a follow-up branch each time. Note `docs/reference/cli-contract.md` §1.3/§7.2 make *substantial `--plain` reformatting* a contract-level change, so phrasing-only tasks need an entry too.
    2. **Re-review the fixes, not just the implementation.** Round 4's most valuable catches were in *fix* passes: a CHANGELOG entry whose four claims were false against source, and two blocking runtime defects (an invisible infinite hang, and an exit-0-with-empty-envelope partial success) that only pass 1 of a two-pass review found.
    3. **A confidently-worded but wrong doc is worse than a missing one.** Multiple round-4 findings were docs asserting things the source contradicted. Every quoted literal output string must be re-verified against the real binary, not reconstructed from a diff.
    4. **The docker e2e harness is a separate contract-test suite `bun test` does not cover, and it is a required CI check.** It serializes on a single `e2e-e2e` container — designate exactly **one** worker per wave to run it. Baseline **302 passed / 0 failed**.
    5. **`git stash` is repo-wide, not per-worktree** — it has previously swapped diffs between sibling worktrees in this campaign. Use `git diff > patch` + `git apply -R`/`git apply` for mutation checks.
    6. **A billing cutoff masquerades as a CI failure**: long jobs cancelled mid-flight, later attempts starting *zero* jobs with a generic "workflow file issue". `gh run rerun --failed` is a no-op on *cancelled* jobs — use a full `gh run rerun`.
