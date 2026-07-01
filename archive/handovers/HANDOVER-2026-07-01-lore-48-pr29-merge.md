# Handover — LORE-48 delivered (PR #29, green); merge → Phase 2 fork (LORE-1)

**Date**: 2026-07-01 | **Grounded against**: branch `feat/lore-48-check-followups`=`origin/…`=`0743f00`; `dev`=`origin/dev`=`8716b67`; `main`=`23f3733` (intentionally behind) | **Backlog**: LORE-48 **In Progress** (PR #29 open, awaiting Jeremy's merge)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Master plan: /Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md (4 phases, approved).

State to verify: PR #29 (feat/lore-48-check-followups -> dev) was OPEN + MERGEABLE + all CI green
(mac/ubuntu/win + compile-smoke) at handover. LORE-48 is the LAST Phase-1 task; it is fully
implemented + /code-review max folded. dev==8716b67, main==23f3733 (do NOT promote main). ssh-agent
is DOWN — route git network via the gh token.

STEP 1 — check if #29 is merged: `gh pr view 29 --repo jeremy-newhouse/lore --json state,mergeCommit`.
Jeremy reviews/merges (do NOT self-merge unless he says so). Merge convention = SQUASH + admin:
`gh pr merge 29 --squash --admin` -> one `feat(LORE-48): … (#29)` on dev.

STEP 2 — post-merge housekeeping (⚠ ORDER MATTERS, dev-sync-reset trap):
  a. The backlog task file `backlog/tasks/lore-48 - …portability-rules.md` has UNCOMMITTED AC-checks
     (all 11 checked) + impl/review-fold notes made this session — they are NOT in the squash.
     Preserve across the dev sync: `git stash push -- "backlog/tasks/lore-48 - "*` (or the full path),
     THEN sync dev: `git checkout dev && git fetch origin dev && git reset --hard origin/dev`
     (`git -c credential.helper='!gh auth git-credential' fetch …` if needed), THEN `git stash pop`.
  b. `backlog task edit LORE-48 -s Done` (ACs already checked; add `--append-notes "delivered via #29 (<squash-sha>)"`).
  c. Commit the backlog state on dev: `chore(LORE-48): mark Done (delivered via #29)` (Claude co-author trailer).
  d. Archive the consumed handover: it is ALREADY moved to `archive/handovers/HANDOVER-2026-06-30-phase1-lore-48-next.md`
     (untracked). Also move THIS file there when done. `git add archive/handovers/ && commit` as
     `docs: archive consumed LORE-48 handovers` (or fold into the chore commit).
  e. Prune the merged branch: local `git branch -d feat/lore-48-check-followups`; remote
     `gh api -X DELETE repos/jeremy-newhouse/lore/git/refs/heads/feat/lore-48-check-followups`;
     then `git update-ref -d refs/remotes/origin/feat/lore-48-check-followups`.

STEP 3 — Phase 2 begins (the fork). First task = LORE-1 (`backlog task view LORE-1 --plain`): create
the `jeremy-newhouse/Backlog.md` fork. Then LORE-2 (`--json` matching docs/reference/backlog-json-schema.md,
the contract of record) -> LORE-13(golden)/3/4 -> LORE-21 adapter. Bookkeeping the plan calls for:
PARK LORE-5 (re-scope to "consume fork as git dep + version floor"; no upstream PR yet); note LORE-32
carries the LORE-21 dep despite its m-4 label. ⚠ Compile the fork binary on the INTERNAL disk
(~/repos/lore), NOT /Volumes/external — external-volume `bun build --compile` fails silently to a
0-byte binary. [[external-volume-bun-exdev-traps]]
```

## State

| Item | Status |
| --- | --- |
| **PR #29** (LORE-48 → dev) | **OPEN**, `mergeable: MERGEABLE`, `reviewDecision` empty (unreviewed); all CI green (mac/ubuntu/win + compile-smoke). Awaiting Jeremy's squash-merge. |
| `feat/lore-48-check-followups` | `0743f00`, local == `origin` (pushed via gh token); 6 commits |
| **LORE-48** | **In Progress**; all 11 ACs checked (uncommitted in task .md); dep LORE-30 Done |
| `dev` / `origin/dev` | both `8716b67` (unchanged this session) |
| `main` | `23f3733` — intentionally behind; do not promote |
| Uncommitted | `backlog/tasks/lore-48 …portability-rules.md` (AC-checks + notes) — preserve across dev sync |
| Phase 1 | **COMPLETE after #29 merges** (LORE-20/31/34/33/48). Phase 2 (fork) is next. |

## Next steps

1. Confirm #29 merged (or wait for Jeremy). Then post-merge housekeeping — see paste-ready STEP 2 (stash backlog edits → sync dev → mark Done → archive handovers → prune branch).
2. Phase 2: **LORE-1** (fork) → **LORE-2** (`--json`) → LORE-13(golden)/3/4 → **LORE-21** adapter. The `{schemaVersion,kind,data}` envelope in `docs/reference/backlog-json-schema.md` is the contract to build to and lock with golden fixtures *before* the adapter.

## Critical context / traps

- **6 commits on the branch** (refactor → core lints → command layer → docs → review fold): `1a08adc` `0f19cad` `1944fca` `99c1ae9` `0743f00` (first is `1a08adc`; run `git log --oneline dev..feat/lore-48-check-followups`).
- **ssh-agent DOWN** → all git network via gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <b>:<b>` then `git update-ref refs/remotes/origin/<b> <sha>`. `gh`/`gh pr`/`gh api` work regardless. Remote branch delete = `gh api -X DELETE repos/jeremy-newhouse/lore/git/refs/heads/<b>`. [[lore-git-workflow]]
- **Commit/stash backlog edits BEFORE the dev sync.** The AC-checks + notes are uncommitted in the task .md; a post-merge `git reset --hard origin/dev` wipes them and `git checkout dev` may carry-or-abort. Stash → reset → pop → mark Done → commit. [[dev-sync-reset-wipes-backlog-edits]]
- **Handover archive files are untracked** (source `.claude/handovers/` is gitignored; `archive/handovers/` is tracked but the moved file is not yet `git add`ed). Untracked files survive `git reset --hard` (only `git clean` removes them), so they're safe until the post-merge `git add archive/handovers/ && commit`. Use plain `mv` + `git add` (a `git mv` fails — source is gitignored).
- **Do LORE-48 findings stay folded:** the `--external` liveness is advisory-only and MUST NOT affect the exit code (ADR-0007); network IO stays out of pure `core/` (ADR-0014). If LORE-27 later layers drift dims on `check`, preserve these invariants.
- **`--json` is the only machine-JSON path**; read backlog deps via `backlog task view --plain`, never grep [[backlog-dependency-grep-trap]]. Code review = the WORKFLOW one (`Skill code-review args "max"`) [[code-review-vs-review-command]].

## Do not repeat

- **Don't self-merge.** Jeremy reviews and squash-merges his PRs. [[lore-git-workflow]]
- **Don't commit the handover archive / backlog metadata into the feature PR** — it belongs on dev with the post-merge `chore(LORE-48): mark Done`, not in the LORE-48 code squash (matches the LORE-33 pattern).
- **Don't compile the fork on /Volumes/external** (Phase 2) — silent 0-byte binary; use ~/repos/lore. [[external-volume-bun-exdev-traps]]
- **Don't add speculative caching / premature optimization** — the `collectExternalLinks` double-parse was deliberately deferred (dwarfed by network IO; folding into `checkBundle` would pollute the pure gate API). [[adjacency-memoization-premature]]

## System of record updated (this session)

- **LORE-48** (In Progress): all 11 ACs checked; plan + full implementation notes + `/code-review max` fold (5 confirmed fixes + 1 deferred efficiency, with rationale) appended. *(uncommitted in the task .md — see traps).*
- **Code on the branch** (`0743f00`, in PR #29): new `core/finding.ts`, `errors.ts` `ioError`, `bundle.ts` `walkFiles`; `--external` liveness + MDX/filename/block-ref/colon/dir-link lints; `links.ts` hardening. `CHANGELOG.md` Unreleased (Added + Changed), `docs/reference/cli-surface.md` §check, `docs/reference/portable-markdown.md` updated.
- Dogfood fix: raw-`{` MDX hazard in `docs/adr/0004` fenced (in the PR).
- Superseded handover `HANDOVER-2026-06-30-phase1-lore-48-next.md` moved to `archive/handovers/` (untracked; commit post-merge).
- Stale auto-snapshot `HANDOVER-2026-06-22T184432Z.md` still in `.claude/handovers/` (low-fidelity; safe to delete).
