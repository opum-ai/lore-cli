# Handover — remaining LCLI-56 Docker E2E follow-ups (LCLI-59, LCLI-60) + two open PRs

**Date**: 2026-07-19 | **Grounded against**: `dev @ 9650cd44bdb8a1b2e2c0e43da30bcde8cd91e1bc` (unchanged this session) | **Backlog**: LCLI-56/57/58 Done, LCLI-59/60 To Do

## Paste-ready prompt for the next session

```
Two of the four LCLI-56 Docker E2E follow-ups are Done (LCLI-57, LCLI-58), each shipped as its
own PR into dev (#53, #54 — see "State" below for merge order). Two remain, independent of each
other and of the two open PRs:

LCLI-59: `lore new Story`'s built-in template has no `<!-- lore:tasks:begin/end -->` markers, so
`lore sync` fails once real tasks are linked to a fresh Story. Read `backlog task view LCLI-59
--plain` for the repro/ACs. AC1 leaves the fix approach open: add the markers to STORY_TEMPLATE
(src/core/template.ts) or have managed-block.ts/sync.ts create the block on first sync when
totally absent — pick one, no design check-in needed (the task's own framing already flags this
as an implementation choice, not a product decision like LCLI-58's was).

LCLI-60: docs/adr/0002-backlog-integration-json-only.md's Decision point 5 overstates the
capability-probe exit code (says missing/too-old/incapable backlog all map to exit 6; the real
code deliberately uses exit 3 for "missing entirely" — probeBacklog's own inline comment explains
why). Doc-only fix, Low priority. AC2 also asks to check
docs/reference/backlog-cli-contract.md and docs/runbooks/agent-onboarding.md for the same
overclaim (not yet checked, per LCLI-56's original notes).

For both: follow the normal backlog instructions task-execution / task-finalization loop, verify
against a REAL pinned-upstream backlog binary (docker/e2e/, not just mocked-adapter unit tests —
LCLI-57/58 both needed this), and update docker/e2e/run-e2e.sh's LCLI-59 regression step (search
"LCLI-59" — flip its expected exit code and delete the workaround block once the template ships
the markers itself) if LCLI-59 lands. LCLI-60 is docs-only and has no run-e2e.sh step to update.

Before starting, check whether PR #53 and/or #54 have merged (see "State" and "Critical context"
below for a real CHANGELOG.md merge-conflict risk between them) and rebase/resync as needed.
```

## State

| Item | Status |
| --- | --- |
| LCLI-57 (`editTask` sent unsupported `--json` to `backlog task edit`, broke link/unlink/rename back-ref writes) | **Done**, all 4 ACs checked with evidence. Shipped as PR [#53](https://github.com/jeremy-newhouse/lore/pull/53) `fix/lore-57-edittask-json` @ `3397ba2`, based on `dev`. CI green (6/6 checks). **Open, not yet merged** — awaiting user review. |
| LCLI-58 (`link`/`unlink --json` leaked a success envelope on stdout on a nonzero exit) | **Done**, all 3 ACs checked with evidence. Design decision made via user check-in: option (b) — nonzero exit + standard ErrorEnvelope on stderr, uniform with every other lore command (not always-exit-0-with-partial-failure-in-data). Shipped as PR [#54](https://github.com/jeremy-newhouse/lore/pull/54) `fix/lore-58-link-unlink-error-envelope` @ `255c07d`, based on `dev` (independent of #53 — different files, no code dependency, though both edit `CHANGELOG.md`, see below). CI green (6/6 checks). **Open, not yet merged**. |
| LCLI-59 (Story template missing `lore:tasks` managed-block markers) | To Do — untouched this session. |
| LCLI-60 (ADR-0002 exit-code doc-accuracy) | To Do — untouched this session, Low priority. |
| `docker/e2e/` harness | Re-run twice this session (once per fix) against the real pinned-upstream binary — 81/81 green both times, confirming each fix and no regression. |

## Next steps

1. Check `gh pr view 53` / `gh pr view 54` for current merge state before doing anything else —
   see the CHANGELOG conflict trap below.
2. Pick up LCLI-59 or LCLI-60 (either order, independent) following `backlog instructions
   task-execution` → `task-finalization`, same pattern as LCLI-57/58 this session: plan recorded
   on the task via `--plan`, verify against a real pinned-upstream `backlog` binary via
   `docker/e2e/` (not just `bun test`), then finalize with `--check-ac`/`--final-summary`.
3. Each fix ships as its own feature branch + PR into `dev` (this project's convention — see
   memory `lore-git-workflow`), based on current `dev` (pull first if #53/#54 have merged).
4. Add a `CHANGELOG.md` `[Unreleased]` → `### Fixed` entry for whichever of LCLI-59/60 you fix,
   matching the style of the LCLI-57/58 entries already added (top of the `### Fixed` list).

## Critical context / traps

- **CHANGELOG.md merge-conflict risk between #53 and #54.** Both PRs insert their own entry at
  the very top of `## [Unreleased]` → `### Fixed` (the file's own convention: newest entries lead
  their subsection). Since both branches forked from the same `dev` commit, whichever PR merges
  **second** will conflict on that hunk. This is a real, expected conflict — not a sign of drift —
  resolve it by keeping both entries (LCLI-58's above LCLI-57's, or vice versa; order between them
  doesn't matter, just don't drop either) when GitHub or a local rebase flags it.
- **The mocked-adapter unit suite cannot catch a `backlog` CLI flag-surface mismatch** — it mocks
  `BacklogAdapter` entirely. Both LCLI-57 and LCLI-58 were real-binary-only findings from LCLI-56;
  treat this as the standing pattern for any future Backlog-adapter bug: a green `bun test` is not
  sufficient evidence, re-verify via `docker compose -f docker/e2e/docker-compose.yml up --build`
  (~2-3 min per run, always tear down after with `docker compose ... down`).
- **LCLI-58's fix changed `runLink`/`runUnlink`'s failure contract**: they now **throw** a `drift`
  `LoreError` (via `backRefFailure()` in `src/commands/link.ts`) instead of returning a number on
  a partial per-task failure — `emit()` is no longer called on that path at all. Any *new* test or
  caller that still expects a returned exit code + a stdout `link.result`/`unlink.result` envelope
  on drift will fail; use the `expectLinkError`/`expectUnlinkError` helpers in `test/link.test.ts`
  (they also assert stdout stays empty) as the pattern for future drift-path tests on these two
  commands.
- **`docs/.obsidian/` sits untracked in the working tree, unrelated to LCLI-57/58/59/60** — present
  since before this session started (confirmed via the initial `git status` snapshot). Leave it
  alone; it is not part of this handover's scope and its origin was not investigated this session.

## Do not repeat

- Don't return a plain exit code from `runLink`/`runUnlink` on a partial-failure path and also
  call `emit()` first — that's exactly LCLI-58's bug. On any failure, either throw before `emit()`
  runs, or don't call `emit()` at all on that branch.
- Don't assume `docker/e2e/run-e2e.sh`'s "known regression" comments are exhaustive proof of what's
  still broken — LCLI-58 turned out to have **no dedicated `run-e2e.sh` step** at all (LCLI-57's
  fix removed the only trigger path the harness happened to exercise), so its regression was
  verified at the unit level instead. Don't force an E2E step to exist just because a task expects
  one; check whether the harness can even deterministically trigger the failure mode first.

## System of record updated

- LCLI-57: plan, implementation notes (fix + verification evidence), final summary, all 4 ACs
  checked, status Done.
- LCLI-58: plan (implicit via the design-decision note), implementation notes (fix + verification
  evidence), final summary, all 3 ACs checked, status Done.
- `docs/reference/cli-contract.md` §4, `docs/reference/cli-surface.md` (link/unlink Output rows),
  `docs/runbooks/agent-onboarding.md` §3.2: clarified that a partial per-item failure on a
  multi-item command follows the same stdout-empty-on-failure rule as any other failure (LCLI-58
  AC3).
- `docker/e2e/run-e2e.sh` Phase 4 and `docs/runbooks/docker-e2e-testing-environment.md`'s
  known-regressions section: updated to drop LCLI-57 (fixed) from the regression baseline; LCLI-58
  never had a dedicated step (see trap above).
- `CHANGELOG.md`: added `[Unreleased]` → `### Fixed` entries for both LCLI-57 and LCLI-58 (on
  their respective branches — see the merge-conflict trap above). LCLI-56 itself still has **no**
  CHANGELOG entry (flagged, not fixed, in the prior handover and again here — out of scope for
  this session since it was already merged before this session started).
