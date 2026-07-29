# Handover — PR #50 (LCLI-41 obsidian scaffold) open for review; 11 code-review findings tracked as LCLI-55 (not yet fixed)

**Date**: 2026-07-18 | **Grounded against**: `dev` @ `284c935` (origin), `feat/lore-41-scaffold-obsidian` @ `4bf39a2` (origin, matches local) | **Backlog**: LCLI-41 Done; LCLI-55 + LCLI-55.1–LCLI-55.11 To Do

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

Context: LCLI-41 (`lore scaffold obsidian`) is implemented, tested, and open as PR #50
(feat/lore-41-scaffold-obsidian -> dev), CI all green (6 checks pass), mergeable, not yet
merged — the user (Jeremy) reviews/merges PRs himself, so do not merge it yourself unless
explicitly asked.

A max-effort /code-review workflow run against PR #50 afterward surfaced 11 verified findings
(6 correctness bugs, 2 test-coverage gaps, 3 cleanup items). Per the user's request ("open
backlog issues for findings") these are tracked as LCLI-55 (umbrella, depends on LCLI-41) with
one subtask each: LCLI-55.1 through LCLI-55.11. None have been started (all To Do).

Two things need a decision before continuing, not yet made:
1. Where do LCLI-55's fixes land? Options: (a) new commits on the existing
   feat/lore-41-scaffold-obsidian branch, extending PR #50 before it merges, or (b) a fresh
   branch off dev once #50 merges, as its own follow-up PR. LCLI-55 is explicitly a separate
   Backlog task from LCLI-41, which argues for (b), but the findings are about code that
   hasn't merged yet, which argues for (a). Ask the user if unclear.
2. 12 new backlog/tasks/lore-55*.md files (the LCLI-55 umbrella + its 11 subtasks) are
   UNTRACKED in git right now, sitting on the feat/lore-41-scaffold-obsidian branch (this repo's
   `backlog task create` does not auto-commit). They need to be committed somewhere. Recommend
   committing them to `dev` directly (this repo's precedent: backlog/task-bookkeeping commits,
   e.g. "docs: archive consumed handover ...", land straight on dev, not via a feature-branch
   PR) — but since they were created while checked out on the LCLI-41 feature branch, do NOT
   let a stray `git add -A`/`git add .` on that branch accidentally bundle them into PR #50's
   diff. Check `git status`/`git diff --stat` before any commit on that branch.

Once those two decisions are made, work LCLI-55.1–.11 via the normal task-execution workflow
(plan, implement, test per subtask, finalize). Priority order by severity (see LCLI-55's own
description and each subtask's ACs for full detail):
- LCLI-55.1 (Medium, bug): rollback leaks an empty docs/ on a never-initialized repo when a
  later write fails — reopens a bug already fixed+regression-tested for mkdocs.
- LCLI-55.5 (Medium, bug): OBSIDIAN_GUIDANCE_NOTES is a shared, unfrozen, un-copied module
  array returned by reference into every plan.
- LCLI-55.2 (Medium, docs): docs/reference/cli-surface.md and cli-contract.md still say
  obsidian is pending/a usage error — now false.
- LCLI-55.3 (Low, bug): never-silent-clobber preflight can't detect a conflict on the `docs`
  ancestor segment itself (only the nested docs/.obsidian leaf).
- LCLI-55.4, .6, .10, .11 (Low, docs): stale comments/docstrings in src/core/consumer-scaffold.ts
  and src/commands/scaffold.ts that this diff should have updated but didn't.
- LCLI-55.7, .8 (Low, chore/test): two test-coverage gaps in test/consumer-scaffold.test.ts
  (a test name claims to cover docusaurus but never calls it; another claims to check line
  ordering but only checks unordered containment).
- LCLI-55.9 (Low, chore): KNOWN_TARGETS/IMPLEMENTED_TARGETS are now identical sets, leaving a
  dead, untested "not implemented yet" branch (the one test that exercised it was deleted this
  PR with no replacement).

Full failure-scenario detail and reproduction notes for every finding are in each subtask's
description (`backlog task view LCLI-55.N --plain`) — written to stand alone without this
handover.
```

## State

| Item | Status |
| --- | --- |
| PR #50 (`feat/lore-41-scaffold-obsidian` → `dev`) | OPEN, mergeable, CI green (compile smoke, docusaurus/mkdocs scaffold smoke, lint·typecheck·test × 3 OS) — awaiting the user's own review/merge |
| LCLI-41 | Done — full plan/notes/final-summary, both ACs checked with real evidence (live Obsidian CLI verification, not just doc-matching) |
| LCLI-55 (umbrella) + LCLI-55.1–.11 | All To Do, none started; each has a description, failure scenario, and testable ACs referencing PR #50 |
| `backlog/tasks/lore-55*.md` (12 files) | **Untracked in git**, sitting on `feat/lore-41-scaffold-obsidian` — not yet committed anywhere (see prompt above) |
| `docs/.obsidian/` | Untracked, intentionally left (real live vault artifacts from AC verification); `.gitignore`'s new exclude-all-except-app.json pattern (part of PR #50) already covers it correctly |
| CHANGELOG.md | Updated (Unreleased → Added: LCLI-41 entry) and committed in PR #50 — no outstanding CHANGELOG work |

## Next steps

1. Decide branch strategy for LCLI-55 fixes (extend PR #50 vs. new branch off dev post-merge) — see paste-ready prompt.
2. Commit the 12 untracked `backlog/tasks/lore-55*.md` files (recommend `dev` directly, per this repo's backlog-bookkeeping-commit precedent) without bundling them into PR #50's diff.
3. Work LCLI-55.1 → LCLI-55.11 in priority order (Medium bugs first: `.1`, `.5`, `.2`; then the Low-priority bug/docs/test items).
4. PR #50 itself needs no further action from the assistant — it's ready for the user's own review/merge whenever they choose; the LCLI-55 findings don't block that if the user prefers to merge now and fix forward.

## Critical context / traps

- The 12 new `backlog/tasks/lore-55*.md` files were created while checked out on `feat/lore-41-scaffold-obsidian` (PR #50's branch) — check `git status` before any commit on that branch so they don't get silently swept into that PR's diff by a broad `git add`.
- Obsidian CLI (`obsidian`, already on PATH at `/usr/local/bin/obsidian`) drives an **already-running** Obsidian.app instance, not a headless one — see the new auto-memory entry `obsidian-cli-available.md` for the exact subcommands (`vaults`, `links`, `backlinks`, `unresolved`, `reload`, `eval`) used to get real, live evidence for LCLI-41's AC#1, and reusable for LCLI-55.1/.3's new regression tests or any future consumer-compatibility work.
- This repo does not dogfood the mkdocs/docusaurus scaffolds into its own tracked files (no committed `mkdocs.yml`/`website/`); `docs/.obsidian/app.json` was likewise deliberately left untracked rather than added to PR #50, matching that precedent. If the user wants to dogfood it, that's a separate, explicit decision — don't assume it from this handover.

## System of record updated

- **LCLI-41** → Done, with full plan/notes/final-summary; both ACs checked with real evidence.
- **LCLI-55 + LCLI-55.1–LCLI-55.11** → created (To Do), each with description, failure scenario, testable ACs, `--ref` to PR #50, and `--modified-file`/`--doc` pointers.
- **CHANGELOG.md** → Unreleased/Added entry for LCLI-41, committed in PR #50 (`4bf39a2`).
- **Auto-memory** → added `obsidian-cli-available.md` (live Obsidian CLI verification technique) and indexed it in `MEMORY.md`.
- **Not yet flushed**: the 12 new backlog task files are uncommitted to git (untracked) — see traps above; this handover is the only record of that gap until they're committed.
