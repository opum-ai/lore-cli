# Handover — LORE-26 (`lore sync`) shipped; LORE-49/LORE-27 unblocked next

**Date**: 2026-07-07 | **Grounded against**: dev/main @ `c93ddef` (main has no independent history, kept ff-synced) | **Backlog**: LORE-26 Done (delivered via #36); LORE-49 To Do (unblocked); LORE-27 To Do (already unblocked, independent)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. LORE-26 (`lore sync`) shipped and merged
via PR #36 (5 rounds of workflow-backed `/code-review max` to full convergence,
plus 3 CI-only fixes discovered only after convergence — see LORE-26's task notes
for the complete round-by-round trail). dev and main are both at c93ddef.

Two follow-ups are unblocked and independent of each other — no locked technical
decision pins which one goes first:

- **LORE-49** (medium priority): retrofit `link`/`unlink`/`rename` (LORE-24, already
  merged) to call `state.ts`'s `commitBacklogIfDirty` immediately after each
  Backlog write, per lore-design.md §3.6's sequence flow. Today `lore sync` alone
  satisfies ADR-0012's "sole committer of backlog/" by vacuuming up whatever's
  dirty under backlog/ whenever it runs — this task closes the gap so
  link/unlink/rename commit their own touches immediately instead of relying on a
  later sync to sweep them up.
- **LORE-27** (high priority): `lore check`'s drift gate — read-only status/
  managed-block drift reporting for CI, exit 6 on drift. Reuses
  reconcile.ts/managed-block.ts the same way `lore sync` (LORE-26) does, but
  diffs against live Backlog data instead of writing.

LORE-27 is High priority vs. LORE-49's Medium, so it's probably the more natural
next pick unless there's a specific reason to close the link/unlink/rename gap
first.
```

## State

| Item | Status |
| --- | --- |
| PR #36 (`feat/lore-26-sync` → `dev`) | Merged (squash, `--admin`, 0 reviews); branch pruned (local + remote) |
| dev / main | Both at `c93ddef`, ff-synced (main has no independent history) |
| LORE-26 | Done |
| LORE-49 | To Do, unblocked (dep LORE-26, now Done) |
| LORE-27 | To Do, already unblocked (dep LORE-22/23, Done) |

## Next steps

1. Pick LORE-27 or LORE-49 (see paste-ready prompt above) — no other session in flight, no blockers.

## Critical context / traps

- **`state.ts`'s git-write seam took 3 of LORE-26's 5 review rounds to get right** — porcelain parsing (`git status --porcelain=v1 -z`, NUL-delimited; never text-format `" -> "` splitting — it mis-splits filenames containing that substring and can't represent an unstaged rename correctly at all), commit pathspec scoping (`git commit -- <paths>` to avoid sweeping unrelated staged content; a **staged** rename needs BOTH its old and new path in the commit's pathspec — omitting the old path resurrects it from `HEAD` — but only the new path in `git add`, since `git mv` already fully removes the old path from the index), and nested-bundle `cwd` (`git status`, unlike `git log`, has **no** `--relative` flag — translate with `git rev-parse --show-prefix` instead). If LORE-49 touches this same commit path, reuse `state.ts`'s `commitBacklogIfDirty` as-is rather than re-deriving any of this.
- **Local `bun test` runs on this machine are macOS, non-UTC timezone** — 3 CI-only failures this session were invisible locally: a timestamp assertion that required an explicit `+HH:MM` offset (git's `%cI` renders UTC as bare `"Z"` on CI's UTC-configured runners), a Windows-specific `renameSync`-onto-directory errno difference (`EPERM`/"denied" vs. POSIX's `EISDIR`/"conflict"), and a real file literally named with `>`, illegal on Windows/NTFS. Always check `gh pr checks <n>` after pushing — a green local run does not mean CI is green (this is the second time this exact lesson has bitten a session; see also LORE-24's Windows `pwd`-spawn miss).
- **LORE-26's full review trail (5 `/code-review max` rounds + the CI-fix round) is on its task notes**, most-recent-first — the complete per-round finding/fix history if you need historical detail; don't re-derive it from the diff.

## System of record updated

- **LORE-26** → marked Done (`backlog task edit --status Done`); all 5 review rounds + the CI-fix round already recorded via `--append-notes` across the session, including the one round-1-fix-introduced-a-new-bug lesson (commit pathspec scoping).
- **LORE-49** → filed this session as the explicit, user-confirmed follow-up (dep LORE-26).
- **CHANGELOG.md**, **docs/adr/0009-story-task-coupling-reconciliation.md**, **docs/reference/cli-surface.md** → updated as part of LORE-26's own PR #36 (already merged; see the PR diff for exact content, not restated here).
