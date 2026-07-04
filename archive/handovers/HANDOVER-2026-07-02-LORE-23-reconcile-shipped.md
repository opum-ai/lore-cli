# Handover — LORE-23 shipped; pick up LORE-24 (lore link/unlink + sync/check wiring)

**Date**: 2026-07-02 | **Grounded against**: `dev`=`main`=`0fe9170` (clean, pushed, no open PRs) | **Backlog**: LORE-23 **Done** (PR #34, merged+promoted); LORE-24 **To Do** (unblocked, dep LORE-21 Done)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Then pick up LORE-24 (lore link /
unlink + the first CLI wiring of the coupling stack) — the last unblocked
task in the M2 Backlog-coupling chain (LORE-23 landed this session).

LORE-24 wires src/core/reconcile.ts (LORE-23, ships reconcileStatus(taskStatuses,
statusFlow)) and src/core/managed-block.ts (LORE-22, regenerateTaskBlock) into
real commands: `lore link`/`lore unlink` (edit a Story's `tasks:` frontmatter +
the task's `doc:<conceptId>` label both ways, ADR-0009 §1-2), and `lore sync`
(writes)/`lore check` (diffs, never writes) driving reconcile + managed-block
over every Story with `tasks:`. Follow the proven command shape
[[lore-cli-command-pattern]]: thin commands/X.ts over the pure core; loadBundle;
read raw file bytes + call adapter.viewTask(id) per linked id; docPath is the
**repo-relative** doc path.

BEFORE wiring reconcile.ts, resolve the scope question flagged on PR #34 (see
"Critical context / traps" below): src/config.ts's `[reconcile.overrides]`
map has no consumer yet, and ADR-0009 §3 (reconcile's only normative source)
never mentions overrides at all. Ask the user how to proceed — implement,
amend ADR-0009, or split into its own follow-up task — before LORE-24 needs a
statusFlow-building step that has to decide whether overrides apply.

LORE-24 also needs a way to read `backlog/config.yml`'s `statuses:` ordered
list into a `StatusFlow` — no existing adapter method reads Backlog config
(adapter.ts only covers task list/view/search/create/edit). Decide where that
read belongs (a new BacklogAdapter method, or a small YAML read in the command
layer — js-yaml is already pinned per [[lore-serialization-invariants]]).

Finalize the standard lore way: feature branch off dev → feat(LORE-24): … →
PR into dev. The user reviews/merges (may ask for admin-merge+promote+prune —
this session's exact shorthand was "state, commit, push, admin merge, prune,
prompt to main /handover"; see [[user-working-style]] for what each step means).
```

## State

| Item | Status |
| --- | --- |
| lore `dev` / `main` | both `0fe9170`, identical, pushed; tree clean; no open PRs |
| **LORE-23** (reconcile.ts status rollup) | **Done** — PR #34 (squash `7080752`), `chore` `0fe9170`, promoted to `main` |
| **LORE-24** (lore link/unlink + sync/check wiring) | **To Do**, dep LORE-21 (Done) → unblocked, next up |
| `/code-review max` on PR #34 | ran before merge; 2 findings fixed in-PR, 2 flagged (see below) |

## Next steps

1. `backlog task view LORE-24 --plain`; re-read `docs/adr/0009-story-task-coupling-reconciliation.md`.
2. Resolve the `reconcile.overrides` scope question (ask the user) before wiring `reconcileStatus` into any command.
3. Design + implement `lore link`/`lore unlink`, then wire `reconcile` + `managed-block` into `lore sync`/`lore check`.
4. Fold in the still-outstanding deferred LORE-22 findings (recorded on LORE-22's task notes): `normalizeLink` throws a bare `Error` (not `LoreError`) on an absolute path — the command must pass a repo-relative `docPath`; the `offsetsOf`/`cell`/`escapeLinkText` DRY overlap with `rewrite.ts`/`indexes.ts` is still open.

## Critical context / traps

- **`reconcile.ts` is ready to consume, with one unresolved gap.** `reconcileStatus(taskStatuses, statusFlow)` (pure, `src/core/reconcile.ts`) rolls up by elimination per ADR-0009 §3 / `backlog-cli-contract.md` §3.2: all-terminal → `done`, any-active → `in-progress`, else → `todo`; empty `taskStatuses` → `null` (leave authored status). It throws `LoreError("validation")` on an unrecognized task status or a degenerate `statusFlow` (now: fewer than 2 entries, or a duplicate). **Gap**: `src/config.ts` (LORE-10) ships `reconcile.overrides` (`Record<string,string>`, a Backlog status → rollup-status override) whose doc comment assigns ownership to "reconcile.ts (LORE-23)" — but ADR-0009 §3 never describes an override mechanism, and `reconcileStatus` has no parameter for it. Posted as a PR #34 comment; unresolved. Don't invent semantics for it — ask first.
- **`reconcile.ts` citations**: cite `docs/reference/backlog-cli-contract.md` (NOT the bare `docs/reference/cli-contract.md`, which is a different document already cited elsewhere — `validate.ts` — for an unrelated §4.1 on truncation-hint rendering). A `/code-review max` finding caught this mix-up mid-session; check any new reconcile-adjacent doc comment against the right file.
- **`managed-block.ts` is READY to consume** — `regenerateTaskBlock(content, rows, {docPath})`. Input must be LF-normalized. `docPath` is repo-relative (`docs/stories/x.md`), not bundle-relative — both operands of `normalizeLink` must share the repo-relative space. [[lore-no-md-serializer]]
- **Reads are JSON-only** via `createBacklogAdapter(spawn)`; never `--plain`, never grep `backlog/tasks/*.md`. [[backlog-fork-checkout]] [[backlog-dependency-grep-trap]] — no adapter method yet reads `backlog/config.yml` (needed for the `statusFlow` LORE-24 must build).
- **`sync` commits only `backlog/`**; `docs/` changes are left staged-or-not per the user's workflow (design §3.4).
- **Post-merge sync trap**: sync local dev with `git pull --ff-only`, not `git reset --hard`. [[dev-sync-reset-wipes-backlog-edits]]
- **This session's finalize shorthand**: the user said "state, commit, push, admin merge, prune, prompt to main /handover" to mean, in order: verify git/PR/Backlog state → commit any pending Backlog-task edits → push → `gh pr merge --squash --admin --delete-branch` → confirm local/remote branch pruned (`git fetch --prune`) → fast-forward-promote `dev` to `main` (`git push origin dev:main`, no PR — `main` has zero history of its own, it always mirrors `dev`'s head; neither branch is GitHub-protected) → mark the Backlog task Done via a separate `chore(LORE-N): mark Done (delivered via #NN)` commit on `dev` → `/handover` write mode. "Prompt to main" was a typo for "promote to main." Worth recognizing verbatim if repeated.

## Do not repeat

- N/A this session — no failed approaches; the one correctness bug found by `/code-review max` (single-entry `statusFlow` silently classifying as `"done"`) was caught and fixed before merge, not discovered as a regression.

## System of record updated

- **LORE-23** → **Done** (PR #34, squash `7080752`; `chore` `0fe9170`; promoted to `main`). Both ACs checked; plan + notes (incl. the `/code-review max` triage, both fixed and deferred findings) + final-summary recorded.
- **PR #34 comment** — posted the full `/code-review max` findings (2 fixed in-PR, 2 flagged as scope questions) for visibility, matching the LORE-22 precedent of recording review triage on the PR itself.
- **CHANGELOG.md** (Unreleased/Added) — the `core/reconcile.ts` entry.
- **Predecessor handover** `HANDOVER-2026-07-02-lore-coupling-sync-check.md` (its LORE-23 step now done, its LORE-24 step carried forward here) → archived to `archive/handovers/` (uncommitted at handover-write time; commit alongside this file).
