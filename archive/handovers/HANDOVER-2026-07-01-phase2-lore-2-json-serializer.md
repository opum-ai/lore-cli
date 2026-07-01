# Handover — LORE-2: implement the `--json` serializer + flag in the Backlog.md fork (Phase 2)

**Date**: 2026-07-01 | **Grounded against**: lore `dev`=`origin/dev`=`18eb886`; fork `jeremy-newhouse/Backlog.md` branch `tasks/back-510-json-output` pushed; working trees clean | **Backlog**: LORE-1 **Done**; LORE-2 **To Do** (dep LORE-1 ✓ satisfied); LORE-5 **parked**

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Master plan (approved, 4 phases):
/Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md

State to trust (verify SHAs anyway): Phase 2 kickoff (LORE-1) is DONE. lore dev==18eb886
(chore(LORE-1): fork + in-fork task + park LORE-5). Working tree clean, on dev, no lore PRs.

THE WORK IS IN THE FORK, NOT THE LORE REPO. Fork checkout: ~/repos/Backlog.md (INTERNAL
disk — never build it on /Volumes/external). Remotes: origin=jeremy-newhouse/Backlog.md,
upstream=MrLesk/Backlog.md. Active branch: tasks/back-510-json-output (carries in-fork
task back-510). Bun 1.2.23.

LORE-2 = implement the --json patch in the fork on that branch, following the runbook
docs/runbooks/backlog-json-patch.md §2-§3 (in the LORE repo) against the contract
docs/reference/backlog-json-schema.md. Build to the { schemaVersion, kind, data } envelope.
  1. src/formatters/task-json.ts — serializeTask (full, kind=task), serializeTaskSummary
     (list/search subset), search wrapper, shared envelope helper. Curated subset, NOT
     JSON.stringify(task): omit rawContent; normalize/omit lastModified (no bare ISO next
     to YYYY-MM-DD); emit assignee->assignees; map AC/DoD to {index,text,checked} (index
     is non-durable); expose both id and filePath.
  2. cli.ts ~425-429: jsonFlagInArgv / isJsonRequested / emitJson; --json forces
     non-interactive + no color like --plain.
  3. .option("--json") + json-BEFORE-plain early-return on task list (~2049/2109),
     task view (~2751/2767), bare task <id> (~2903/2934), search (~1743/1807). Ordering
     is THE critical correctness detail (before isPlainRequested||shouldAutoPlain), else a
     piped --json emits plain text. Re-grep line numbers — they are anchors at v1.47.1.
  4. src/test/cli-json-output.test.ts mirroring cli-plain-output.test.ts, INCLUDING the
     mandatory non-TTY pipe case. addHelpSchema + CLI-INSTRUCTIONS.md updates.
  5. Green gate: `bun run check .` && `bunx tsc --noEmit` && `bun test`. --plain output
     stays byte-identical.

Commit style in the fork: "BACK-510 - <what>". Push to origin (fork). Do NOT open an
upstream PR (LORE-5 parked). Do NOT prune / merge tasks/back-510-json-output.

Then finalize LORE-2 in the LORE repo: check its 2 ACs, notes, mark Done via a chore
commit on dev (the LORE-1 pattern). LORE-13(golden)/LORE-3/LORE-4 lock the schema BEFORE
LORE-21 (lore's adapter).
```

## State

| Item | Status |
| --- | --- |
| **LORE-1** | **Done** — fork + in-fork task `back-510` delivered; committed `18eb886` |
| lore `dev` / `origin/dev` | both `18eb886`; clean; no open PRs |
| **Fork** `jeremy-newhouse/Backlog.md` | public; `~/repos/Backlog.md`; origin=fork, upstream=MrLesk; `main` current w/ upstream |
| Fork branch `tasks/back-510-json-output` | pushed; carries task `back-510` (5 AC + plan + 3 DoD); LORE-2's working branch |
| **LORE-2** (next) | **To Do**, High, dep LORE-1 ✓ — implement `--json` in the fork |
| **LORE-5** | **parked** — upstream PR deferred (no upstream issue/PR exists); notes+comment recorded |
| **LORE-32** | already carries the LORE-21 dep (no action) |
| Active handovers | this one only (LORE-1 kickoff handover archived in `18eb886`) |

## Next steps

1. **LORE-2** — in `~/repos/Backlog.md` on `tasks/back-510-json-output`, implement the fork patch per `docs/runbooks/backlog-json-patch.md` §2–§3 and `docs/reference/backlog-json-schema.md`. Green gate + push to fork origin.
2. Finalize **LORE-2** in the lore repo: `--check-ac 1 --check-ac 2`, append notes, mark **Done** via a `chore(LORE-2)` commit on `dev` (LORE-1 pattern).
3. **LORE-13 (golden) / LORE-3 / LORE-4** — lock the schema with golden fixtures + build the patched binary + wire lore's capability probe, **before** **LORE-21** (lore's JSON-only adapter).

## Critical context / traps

- **BUILD ON INTERNAL DISK.** `~/repos/Backlog.md`, never `/Volumes/external` — `bun build --compile` there fails to a silent 0-byte binary; isolated `bun install` hits EXDEV. [[external-volume-bun-exdev-traps]] [[backlog-fork-checkout]]
- **json-before-plain ordering** is the one correctness detail that matters: the JSON early-return must precede `isPlainRequested(options) || shouldAutoPlain` at cli.ts 1807/2109/2767/2934, or a piped `--json` (non-TTY) emits plain text. The test file's non-TTY pipe case is the regression guard — do not skip it.
- **Line numbers are anchors at v1.47.1** — re-grep after any rebase on upstream; the fork is an active repo.
- **`back-510` ID collision**: upstream's unmerged `tasks/back-510-repeated-label-flags` uses `back-510` for a different task. Fine now (highest on upstream/main = 509). If upstream merges theirs before we rebase, renumber ours (rename file + `id:` frontmatter). Runbook §8. [[backlog-fork-checkout]]
- **Don't open an upstream PR** (LORE-5 parked) and **don't merge/prune** `tasks/back-510-json-output` — it's LORE-2's live working branch.
- **Backlog deps via `backlog task view --plain`, never grep.** [[backlog-dependency-grep-trap]]
- **ssh-agent was UP this session** (normal `git push` worked); if it's down next time, route via the gh token. [[lore-git-workflow]]

## Do not repeat

- **Don't clone the fork onto `/Volumes/external`** — reuse `~/repos/Backlog.md` (already set up: origin=fork, upstream=MrLesk).
- **Don't renumber `back-510` preemptively** — considered and rejected; an arbitrary high id just risks a different upstream collision. `back-510` is the correct next id on main today; renumber only if/when upstream's `back-510` actually merges.

## System of record updated (this session)

- **LORE-1** → **Done**; notes record fork URL, `~/repos/Backlog.md` remote layout, `back-510`, and the collision hazard.
- **LORE-5** → parked/re-scoped (notes + comment): upstream PR deferred; git-dep/version-floor work reassigned to LORE-2/LORE-21.
- **lore `dev`** `18eb886` = `chore(LORE-1): Done — forked Backlog.md + in-fork --json task; park LORE-5` (backlog edits + archived LORE-1 kickoff handover). Pushed.
- **Fork**: branch `tasks/back-510-json-output` pushed with task `back-510`.
- **Auto-memory**: added [[backlog-fork-checkout]] (fork location/remotes/branch/collision hazard) + MEMORY.md index line.
