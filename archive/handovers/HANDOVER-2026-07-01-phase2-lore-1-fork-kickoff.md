# Handover — Phase 1 landed; begin Phase 2 = the Backlog.md fork (LORE-1 → LORE-2 → … → LORE-21)

**Date**: 2026-07-01 | **Grounded against**: `dev`=`origin/dev`=`e1c28bf`; `main`=`23f3733` (intentionally behind); working tree CLEAN; no active handovers | **Backlog**: LORE-48 **Done** (Phase 1 complete); next = LORE-1 **To Do**

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Master plan (approved, 4 phases):
/Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md

State to trust (verify SHAs anyway): Phase 1 is COMPLETE and merged. dev==e1c28bf
(LORE-48 delivered via squash #29 = b9049fe, plus chore mark-Done e1c28bf). main==23f3733
(intentionally behind — do NOT promote main). Working tree clean, on branch dev, no open PRs.
ssh-agent may be DOWN — route git network via the gh token (see traps).

PHASE 2 = the Backlog.md fork. This is NOT the lore CLI codebase — it forks an EXTERNAL
repo (MrLesk/Backlog.md, a TypeScript/Bun project) to add a `--json` contract lore consumes.

Execution order (deps verified via `backlog task view LORE-N --plain`, NOT grep):
  LORE-1  (To Do, dep: none)     — fork MrLesk/Backlog.md -> jeremy-newhouse/Backlog.md +
                                    create the in-fork tracking task per its PR template.
  LORE-2  (To Do, dep: LORE-1)   — src/formatters/task-json.ts + per-command --json flag
                                    (json-before-plain) on task list/view(+task id)/search.
                                    Build to the {schemaVersion,kind,data} envelope in
                                    docs/reference/backlog-json-schema.md (THE contract of record).
  LORE-13 (golden) / LORE-3 / LORE-4 — lock the schema with golden fixtures BEFORE the adapter.
  LORE-21 (adapter)              — lore's consumer-side adapter over the fork's --json.

Plan bookkeeping to enact at Phase 2 start (from the master plan):
  - PARK LORE-5: re-scope to "consume fork as git dep + version floor" (no upstream PR yet).
    `backlog task edit LORE-5 -s "To Do"` won't park it — check `backlog` for the parked/blocked
    status verb; if none, leave a --comment recording the re-scope + set a blocking dep.
  - NOTE LORE-32 carries the LORE-21 dependency despite its m-4 milestone label (don't start
    LORE-32 until LORE-21 lands).

⚠ COMPILE TRAP: compile the fork binary on the INTERNAL disk (~/repos/lore or a fresh clone
under ~), NOT /Volumes/external — external-volume `bun build --compile` fails SILENTLY to a
0-byte binary and isolated `bun install` hits EXDEV. [[external-volume-bun-exdev-traps]]

Git workflow: per-task feature branch off dev -> PR into dev; Jeremy reviews + squash-merges
(do NOT self-merge). [[lore-git-workflow]]
```

## State

| Item | Status |
| --- | --- |
| **Phase 1** | **COMPLETE** — LORE-20/31/34/33/48 all merged into `dev` |
| **LORE-48** | **Done** — delivered via squash PR #29 (`b9049fe`); mark-Done chore `e1c28bf` |
| `dev` / `origin/dev` | both `e1c28bf` (in sync; pushed via gh token) |
| `main` | `23f3733` — intentionally behind; do NOT promote |
| Working tree | **clean**; on branch `dev`; no open PRs |
| **LORE-1** (next) | **To Do**, High, no deps — fork the repo + in-fork task |
| **LORE-2** | **To Do**, dep LORE-1 — `--json` serializer + flag |
| Active handovers | none (this session's two were archived + committed in `e1c28bf`) |

## Next steps

1. **LORE-1** — fork `MrLesk/Backlog.md` → `jeremy-newhouse/Backlog.md` (`gh repo fork MrLesk/Backlog.md --clone=false`), then create the in-fork tracking task per that repo's PR template. AC: public fork exists + in-fork task with AC/plan/Testing.
2. **LORE-2** — `src/formatters/task-json.ts` + per-command `--json` (json-before-plain) on `task list` / `task view` (+`task id`) / `search`; ISO `lastModified`; omit `rawContent` by default. Emit the canonical `{schemaVersion,kind,data}` envelope from `docs/reference/backlog-json-schema.md`.
3. Lock the schema with **golden fixtures (LORE-13)** + LORE-3/4 **before** building **LORE-21** (lore's adapter).
4. Enact plan bookkeeping: **park/re-scope LORE-5**; note **LORE-32 → LORE-21** dep.

## Critical context / traps

- **Phase 2 edits an EXTERNAL repo**, not the lore CLI. The `docs/reference/backlog-json-schema.md` in THIS repo is the contract lore builds the fork to satisfy; `docs/runbooks/backlog-json-patch.md` is LORE-1's runbook.
- **COMPILE ON INTERNAL DISK.** `/Volumes/external` breaks `bun build --compile` (silent 0-byte binary) and isolated `bun install` (EXDEV). Clone/build the fork under `~`. [[external-volume-bun-exdev-traps]]
- **ssh-agent may be DOWN** → git network via gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <b>:<b>` then `git update-ref refs/remotes/origin/<b> <sha>`. `gh`/`gh pr`/`gh api` work regardless; remote branch delete = `gh api -X DELETE repos/jeremy-newhouse/lore/git/refs/heads/<b>`. [[lore-git-workflow]]
- **Read backlog deps via `backlog task view --plain`, never grep** `backlog/tasks/*.md` (grep falsely reports "no deps"). [[backlog-dependency-grep-trap]]
- **Don't self-merge** — Jeremy reviews + squash-merges his PRs. Backlog metadata / consumed handovers land on `dev` in a `chore` commit AFTER the squash, never inside the feature PR. [[dev-sync-reset-wipes-backlog-edits]]
- **Squash-merged branches need `git branch -D`** (force) to prune — `-d` refuses because the squash commit isn't recognized as a merge of the branch's commits. This is expected, not data loss.

## Do not repeat

- **Don't compile the fork on `/Volumes/external`** — silent 0-byte binary; use `~`. [[external-volume-bun-exdev-traps]]
- **Don't open an upstream PR to MrLesk/Backlog.md yet** — LORE-5 is being re-scoped to "consume fork as git dep + version floor"; upstreaming is deferred.
- **Don't grep for task dependencies** — always `backlog task view --plain`. [[backlog-dependency-grep-trap]]

## System of record updated (this session)

- **LORE-48** → **Done**; delivery note appended (`delivered via #29, squash b9049fe`).
- **dev** `e1c28bf` = `chore(LORE-48): mark Done (delivered via #29); archive consumed handovers` (backlog task .md AC-checks/notes + both consumed handovers).
- Consumed handovers `HANDOVER-2026-06-30-phase1-lore-48-next.md` and `HANDOVER-2026-07-01-lore-48-pr29-merge.md` moved to `archive/handovers/` (committed). Stale auto-snapshot `HANDOVER-2026-06-22T184432Z.md` deleted.
- Branch `feat/lore-48-check-followups` pruned (local + remote).
- No CHANGELOG/docs/memory changes needed — LORE-48's release notes shipped in #29; Phase-2 bookkeeping is not yet enacted (listed as next steps).
