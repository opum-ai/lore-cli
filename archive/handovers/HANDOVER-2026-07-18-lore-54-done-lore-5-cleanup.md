# Handover — LCLI-54 shipped and merged to main; upstream-adoption thread (LCLI-5) has no actionable next step (LCLI-54, LCLI-5)

**Date**: 2026-07-18 | **Grounded against**: `dev`/`main` both @ `21fa4b9` (clean, in sync with `origin/dev` and `origin/main`, no open PRs) | **Backlog**: LCLI-54 Done; LCLI-5 In Progress (2/2 own ACs now checked, blocked on an external tagged release); LCLI-53/LCLI-4/LCLI-3 Done

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

Context: LCLI-54 (rewrite src/adapters/backlog.ts against upstream's real --json
contract) is fully implemented, tested (including a real end-to-end run against a
locally-built pinned upstream binary, not just fake-spawn unit tests), documented,
committed (173605e "feat(LCLI-54): rewrite backlog adapter against upstream's real
--json contract"), pushed to origin/dev, fast-forwarded to main, and pushed there
too. A follow-up commit (21fa4b9, "docs: archive consumed handover
lore-54-adapter-rewrite") archived the prior session's handover and was likewise
pushed to both dev and main. Nothing pending from either commit.

LCLI-5 (the umbrella "open the upstream --json PR and migrate lore on release"
task) had both its own ACs checked this session, since LCLI-54 satisfied AC#2 (the
full adapter now matches upstream's contract) on top of LCLI-53's AC#1 (the probe
already did). It is left In Progress, not Done: its own description also covers
switching from the interim pinned-commit build to a real `package.json` semver
dependency + bumping the capability probe's version floor once a tagged
MrLesk/Backlog.md release actually includes PR #790 (commit 22a091b). That step is
gated on an external event outside this repo's control -- there is nothing to
implement until MrLesk/Backlog.md cuts a release. Do not attempt it now; check
`backlog task view LCLI-5 --plain` (or the upstream repo's release list) first if
picking this thread back up later.

There is no other in-flight thread from this work. The Backlog "To Do" queue is
currently all LOW-priority, explicitly deferred items (LCLI-41 obsidian scaffold,
LCLI-42 MCP server v2, LCLI-43/44 Confluence adapters, LCLI-45 typed importable
library, LCLI-52 stale remark/unified doc-reference cleanup) -- none are a natural
continuation of the upstream-adoption thread. Ask the user what to prioritize next
rather than assuming one of these, or run `backlog task list --plain` /
`backlog search "<topic>" --plain` to re-survey the full backlog before picking
anything.
```

## State

| Item | Status |
| --- | --- |
| `dev` | `21fa4b9`, clean, in sync with `origin/dev` |
| `main` | `21fa4b9`, clean, in sync with `origin/main` (ff-pushed from dev — main has no independent history) |
| LCLI-54 | **Done**, committed (`173605e`) and pushed/merged |
| LCLI-5 | In Progress; both its own ACs now checked; remaining scope (semver dependency + floor bump) blocked on an external upstream release |
| LCLI-53 / LCLI-4 / LCLI-3 | Done (unchanged this session, confirmed as LCLI-5's now-complete dependency set) |
| No open PRs, no feature branches | This session's commit went directly to `dev` then ff-merged to `main` (user's explicit instruction: "stage, commit, push, merge to main, push, prune feature branches, /handover") — no feature branches existed to prune |

## Next steps

1. No specific next step is owed on this thread — it is closed out until an external event (a tagged `MrLesk/Backlog.md` release including PR #790 / commit `22a091b`) unblocks LCLI-5's remaining scope.
2. If resuming general work, ask the user what to prioritize; the current Backlog "To Do" queue is all low-priority deferred items (see paste-ready prompt above) with no obvious default.
3. Periodically (e.g. next session touching this area) it may be worth checking `https://github.com/MrLesk/Backlog.md/releases` for a tag past `22a091b570d44c4f302ca47e7fd36fa28ad8bcb0` — if one exists, LCLI-5's final step (real `package.json` dependency + version-floor bump) becomes actionable.

## Critical context / traps

- **`lore`'s own repo checkout `/Volumes/external/repos/Backlog.md`** (symlinked from `~/repos/Backlog.md`) is the **fork** (`jeremy-newhouse/Backlog.md`, branch `tasks/back-510-json-output` @ `a80b7a1`), not upstream — it has both `origin` (fork) and `upstream` (`MrLesk/Backlog.md`) remotes configured and `upstream` already fetched, including the pinned commit. Do not confuse this checkout with a fresh upstream clone; a real-upstream verification needs a separate worktree/clone checked out at the pinned commit (a scratch `git worktree add <scratch-path> 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0` off this same local repo works fine and avoids a network clone — used and cleaned up this session).
- **Real-binary verification technique (now used twice — LCLI-53, LCLI-54 — reuse directly again if a future migration step needs it):** worktree/clone at the pinned commit, `bun install`, run **interpreted** (`bun src/cli.ts ...`), not `bun build --compile` (silently fails on this repo's external-volume checkout). `--version` needs `cwd` = upstream's own checkout dir; real project reads need `cwd` = the target project.
- **Upstream's `task-list`/`search` summaries carry no file path at all** — only `task view`'s `path` field does (already project-relative, no absolute/host-specific field survives anywhere in the contract). `lore`'s `BacklogTask` type has no `file` field for this reason; only `BacklogTaskDetail` (from `viewTask`) does. Don't reintroduce a `file` field on the base type without re-verifying this against upstream's serializer first.
- **`priority` and `type` are open, config-driven strings upstream (`backlog/config.yml`'s `priorities:`/`types:`), not a closed `"high"|"medium"|"low"` enum.** `src/adapters/backlog.ts`'s `BacklogPriority` type and Zod schemas were widened accordingly this session — don't narrow them back to a closed enum.

## Do not repeat

- Don't assume `.claude/handovers/` files can be `git mv`'d — that directory is gitignored (untracked); use a plain `mv` then `git add` the `archive/handovers/` destination.
- Don't leave the two-tier probe/read fake in `test/backlog-adapter.test.ts` in place once the probe and the full adapter target the same contract — LCLI-54 collapsed it back to one shared golden per the prior handover's explicit instruction; if a future contract migration re-diverges the two, expect to re-split it, but don't leave stale two-tier logic around once they reconverge again.

## System of record updated

- **LCLI-54** → Done, with full plan/notes/ACs/final-summary (see task history for detail); no further action needed on it.
- **LCLI-5** → both ACs checked with a note explaining what remains and why it's deliberately not marked Done yet.
- **Git**: `173605e` (LCLI-54 implementation + doc updates) and `21fa4b9` (the handover-archive commit) both pushed to `origin/dev`, then fast-forwarded and pushed to `origin/main` (main has no independent history — a straight ff, not a real merge), per explicit user instruction this session.
- **Old handover archived**: `HANDOVER-2026-07-18-lore-54-adapter-rewrite.md` → `archive/handovers/` (its work is what this session completed).
