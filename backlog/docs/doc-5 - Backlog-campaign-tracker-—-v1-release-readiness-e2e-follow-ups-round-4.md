---
id: doc-5
title: Backlog campaign tracker — v1 release readiness & e2e follow-ups (round 4)
type: other
created_date: '2026-07-25 02:15'
updated_date: '2026-07-25 03:37'
---
# Backlog campaign tracker — v1 release readiness & e2e follow-ups

Round 4 of the lore backlog campaign. Round 1 (doc-1, LORE-69..95, 20 high), round 2 (doc-3, LORE-96..194, 78 medium), round 3 (doc-4, LORE-198..250, 55 low) closed the entire Codex second-opinion review (doc-2) and are all Done. This round covers the **v1-release-readiness follow-ups + e2e-testing findings** filed 2026-07-24 (LORE-253..263) — the residue after the review campaign, surfaced by shipping-readiness work, LORE-252 (Windows CI green), and a 56-concept/40-task Meridian e2e stress test.

Protocol: restore → compute the ready/conflict graph → mark the wave Dispatched → dispatch (parallel Sonnet implement + Fable review) → serialize the merge → update this tracker once more at settlement → loop until the queue is empty or blocked → write handover.

## Scope / order confirmation

- **Scope**: the 9 agent-resolvable follow-ups from LORE-253..263 (bug/enhancement polish + CI/release + the onboarding feature). The 6 non-agent-resolvable items are in "Not queued" below.
- **Order**: user confirmed **"Lowest-risk first"** on 2026-07-24 — small bug/polish fixes → CI/release → the large onboarding feature (LORE-260) last. This is the wave-builder's **tie-break only**, NOT a strict execution order; the ready set is recomputed live each restore.
- All 9 queued tasks carry **zero formal Backlog dependencies** (re-verified live 2026-07-25 by YAML parse); readiness is gated purely by the live pairwise file-conflict graph + the 6-worker wave cap.

## Frontier

The "ready now" set is **always recomputed live** from `backlog/tasks/*.md` + this table at the start of every restore/wave — never trust a persisted "next wave" plan. Informational hint only: as of **wave 1 settlement (2026-07-25)**, **4 resolved**, **5 queued**, **0 in-flight**, **6 not queued**.

Live conflict edges as computed at wave 1 (file-citation read, over-approximated per skill R4b) — **recompute, do not trust**:
- **259 ↔ almost everything.** LORE-259 AC#1 harmonizes *every* `missing required arg` usage error, and the shared `usage()` helper (`src/commands/args.ts:58`) is called from 18 command files: `replace, schema, scaffold, help, new, validate, supersede, args, context, graph, agents, orphans, query, instructions, link, check, rename, tasks`. Any task touching one of those files conflicts with 259. Verified: `src/commands/fswrite.ts` has **zero** `usage()` call sites, so **256 does not conflict with 259**.
- 256 ↔ 263 (both `src/commands/fswrite.ts`) — 263 now Done, edge retired
- 260 ↔ 263 (both `src/commands/scaffold.ts`) — 263 now Done, edge retired
- 255 ↔ 260 (both may touch `src/cli.ts`)
- 259 ↔ 261 (`orphans.ts` calls `usage()`), 259 ↔ 260 (`scaffold.ts`/`agents.ts` call `usage()`)

## Queue (confirmed order)
| # | Issue | Cluster | Formal deps | Status | Wave | Note |
|---|---|---|---|---|---|---|
| 2 | LORE-259 | cmd-link/errors-output | — | To Do | — | bug. Consistent usage/error/success phrasing: missing-arg templates, misdirecting bad-id hint (points at check, should be query/graph), unexplained '(doc)'. [src/commands/link.ts, tasks.ts + the 18 `usage()` call sites] |
| 4 | LORE-261 | cmd-meta-a | — | To Do | — | enhancement. orphans should not flag subtasks of a linked parent (parent/subtask hierarchy) — or link cascades. [src/commands/orphans.ts, reconcile-shared.ts, adapters/backlog.ts] |
| 6 | LORE-256 | cmd-crud-b (fswrite) | — | To Do | — | bug. Bounded renameSync EPERM/transient-lock retry in writeFileAtomic/writeFileNoFollow. Windows-CI-verified. [src/commands/fswrite.ts] |
| 8 | LORE-255 | build-ci-config | — | To Do | — | task. First-release rehearsal: npm publish --dry-run of all 6 artifacts + a first-release checklist (+ wire the dispatch-gated publish job). [.github/workflows/release.yml, docs/runbooks/release-publishing.md] |
| 9 | LORE-260 | cmd-init/agents/scaffold | — | To Do | — | enhancement (LARGE). One-command onboarding: interactive wizard by default (TTY-gated), flags for prompt-free/CI. Decision locked; may warrant an ADR. [src/commands/init.ts, agents.ts, scaffold.ts] |

## Resolved
| # | Issue | Status/date/wave | Evidence summary |
|---|---|---|---|
| 1 | LORE-258 | Done · 2026-07-25 · wave 1 | PR [#243](https://github.com/jeremy-newhouse/lore/pull/243), merged `2f44ada`. Suppresses the `no frontmatter mapping` advisory for `RESERVED_STEMS` (index/log) at `loadBundle`'s single choke point in `src/core/bundle.ts`; `check`/`validate` needed no source change and are pinned by new tests. Decision recorded: suppression, not a check-side skipped-count. Fable **approve**, 0 fix cycles — all 3 ACs independently confirmed incl. a reverse-apply experiment proving the new tests bite (4 fail with the fix reverted). `bun test` 2072/0, typecheck/lint clean, `lore check` 38 files 0/0; live repro went 6 spurious warning lines → 0. |
| 3 | LORE-263 | Done · 2026-07-25 · wave 1 | PR [#244](https://github.com/jeremy-newhouse/lore/pull/244), merged `42ce1bc`. `lore scaffold <target>` is idempotent when the on-disk generated config is byte-identical (exit 0 no-op); only a user-MODIFIED file conflicts (exit 5, names the file, hints `--force`); `--force` unchanged. New `classifyExistingFile` in `fswrite.ts` — lstat-based and conservative (symlink/dir/unreadable always `differs`, so the idempotent skip can never bypass the LORE-76 symlink guard). Fable **approve** after **2 fix cycles**. ⚠️ **Failed the required docker-e2e gate on the first PR run (298/1)** — `docker/e2e/run-e2e.sh:1324` still asserted the old always-conflicts contract. Fix rewrote Phase 18 strictly *stronger* (299→302 assertions: no-op arm asserts exit 0 AND empty `.data.files`; modified arm asserts exit 5 + message names the file + hint has `--force` + a separate check the hand-edit survived; `--force` arm strengthened). Local harness re-run **302 passed / 0 failed**. |
| 5 | LORE-262 | Done · 2026-07-25 · wave 1 | PR [#245](https://github.com/jeremy-newhouse/lore/pull/245), merged `06890dc`. `rewriteInbound` (`src/core/rewrite.ts`) now surfaces any inbound link whose display TEXT still names the OLD id after retargeting, via a new pure `RewritePlan.textMismatches` rendered as a stderr warning by both `supersede` and `rename`. Decision recorded: **report, don't skip** — skipping is unsafe for `rename` (it deletes the old file, so a skipped link would dangle). Fable **approve**, 0 fix cycles; all 4 ACs confirmed by live CLI runs; 11 new regression tests; exit codes and `--json` envelope untouched. |
| 7 | LORE-254 | Done · 2026-07-25 · wave 1 | PR [#246](https://github.com/jeremy-newhouse/lore/pull/246), merged `aec6fa5`. Daily-scheduled `.github/workflows/upstream-backlog-watch.yml` drives `src/scripts/upstream-backlog-watch.ts`, which polls the upstream Releases API and **ancestor-checks** each candidate tag against commit `22a091b` via the compare API (`identical`/`ahead`) — distinguishing a genuinely `--json`-capable tag from a merely-newer one (AC#2). First qualifying release opens a one-time `upstream-watch` issue naming LORE-253; documented in `docs/runbooks/upstream-backlog-md-json-tag-watch.md`. Fable **approve** after **2 fix cycles** (pass 2 caught a **blocking workflow-permissions defect**); reviewer ran a mutation check proving the round-2 regression test pins its fix. 13 new tests. **Unblocks LORE-253** once upstream tags. |

## Not queued — needs a human / blocked
- **LORE-253** (migrate adapter to the released --json backlog): BLOCKED on an external event — MrLesk/Backlog.md must tag a release >v1.48.0 containing commit 22a091b (PR #790). Latest tag v1.48.0 (2026-07-12) predates it by 10 commits. Not agent-resolvable until then. **LORE-254 (Done, wave 1) is now its live watch/trigger** — a daily job will open an `upstream-watch` issue when the qualifying tag appears.
- **LORE-257** (make windows-latest a required check): NEEDS-HUMAN (repo-admin) — toggling a branch-protection ruleset is a human action an autonomous agent must not self-authorize (same boundary as LORE-196). Agent role is prep/verify only; the toggle is out of an agent's reach.
- **LORE-42** (lore mcp server), **LORE-43** (Confluence publish adapter), **LORE-44** (Confluence prod mirror), **LORE-45** (typed importable library): DEFERRED-v2 — post-v1 roadmap requiring product/scope decisions + a release milestone; not agent-resolvable now.

## Wave log
- 2026-07-24 — init: round-4 tracker created from LORE-253..263. 9 queued (lowest-risk-first, user-confirmed), 6 not queued. No waves dispatched yet.
- 2026-07-25 — **wave 1 COMPLETE** (issues: LORE-258, LORE-263, LORE-262, LORE-254; workers: sonnet, reviewer: fable; wave base `be730be`). All four reached `approve` and merged; `dev` @ `42ce1bc`; all worktrees/branches pruned. 14 agents, 4 fix cycles total (258: 0, 262: 0, 263: 2, 254: 2). No escalations, no `human_needed`, no merge conflicts (every rebase clean; each branch re-verified in its worktree post-rebase before push).
  - **Gate lesson (load-bearing for future waves):** LORE-263 passed `bun test`/typecheck/lint/`lore check` *and* its unit review, then failed the **required docker-e2e CI gate**. The e2e harness (`docker/e2e/run-e2e.sh`) is a separate contract-test suite that `bun test` does **not** cover, and it encodes user-visible CLI contracts. **Any task changing a user-visible CLI contract must run the docker e2e harness locally before review** — add it to the worker's verification set, not just the reviewer's.
  - **Wave-level integration review** (Fable, over `be730be..42ce1bc`): composition **sound**. Verified on the merged tree — `bun test` 2110/0, typecheck/lint clean, `lore check` 39 files 0/0 — plus live composed-CLI runs proving LORE-258's reserved-stem suppression and LORE-262's mismatch warning coexist correctly in one `rename`/`supersede` invocation (separate collectors, separate layers; no double-flush, no swallow), that `RESERVED_STEMS` (defined in `src/core/scaffold.ts`, unmodified by any branch) kept one meaning, that `RewritePlan.textMismatches` is purely additive with no duplicate definitions, that no import cycle was introduced, and that **no test file was modified by two branches** (the collateral-test-file collision vector). LORE-254 is fully disjoint (its script imports nothing from `src/`).
  - **One finding — minor, narrow:** `docs/reference/cli-surface.md` (scaffold section, Exit row) still documented the pre-LORE-263 always-conflicts contract. In a docs-native project that is a real defect. Handled as a direct follow-up on `feature/wave1-docs-drift` off `42ce1bc` (Sonnet fix + Fable re-review), which also sweeps the repo's prose for the same drift and corrects a separate pre-existing README error (`lore scaffold agent` does not exist; `lore agents` emits SKILL.md). **In flight at the time of this settlement** — outcome recorded at the next settlement.
