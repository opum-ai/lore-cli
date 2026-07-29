# Handover — LCLI-5 prior-art reply posted; still pick LCLI-41 / LCLI-52 next

**Date**: 2026-07-16 | **Grounded against**: `dev`/`main` both @ `39bf00e` (no open PRs) | **Backlog**: LCLI-5 In Progress (posted, waiting again); LCLI-41/LCLI-52 untouched, ready

## Paste-ready prompt for the next session

```
Since the last handover on this topic, a `/handover restore` session found that MrLesk
(upstream Backlog.md maintainer) had already responded on issue #784 — the response predated
the previous handover but hadn't been flushed into LCLI-5 yet. He scoped structured JSON output
upstream as BACK-545, asked to hold off on PRs, and asked for prior art: fork branch/commit link
+ representative output for (1) task list, (2) single task, (3) heterogeneous search, (4) empty
result + error case.

That reply has now been posted: https://github.com/MrLesk/Backlog.md/issues/784#issuecomment-4998567172
It links our fork's tasks/back-510-json-output branch @ a80b7a1, includes all four requested
samples (generated against a clean throwaway scratch project, not the real lore backlog, with
the local path sanitized before posting), and discloses a real gap found while producing the
error-case sample: `task view --json` on a not-found task silently drops --json, prints plain
text to stderr, and exits 0 — inconsistent with `task archive`'s not-found handling (same
message, but `process.exitCode = 1`). Framed as exactly the "error behavior" question he asked
to settle, not defended as correct.

FIRST run `backlog instructions overview`.

LCLI-5 is back to waiting — this time on MrLesk (and/or lenucksi, the other contributor with a
fork) responding to that prior art. Check https://github.com/MrLesk/Backlog.md/issues/784 for a
reply before doing anything else on this task; still do not open an upstream PR before the
contract discussion resolves.

Nothing else is in flight. If LCLI-5 is still waiting, pick one of:

1. LCLI-41 (lore scaffold obsidian) — the natural next consumer-scaffolding target, same shape
   as LCLI-39 (mkdocs)/LCLI-40 (docusaurus): a .obsidian/ vault config, additive outside docs/.
   Mirror src/core/consumer-scaffold.ts's buildMkdocsScaffold/buildDocusaurusScaffold pattern,
   and commands/scaffold.ts's BUILDERS registry (adding "obsidian" to BUILDERS is the only wiring
   point; IMPLEMENTED_TARGETS is derived from it). No CI build-smoke precedent exists for
   Obsidian (unlike mkdocs/docusaurus's real-build CI jobs), since Obsidian isn't CLI-scriptable
   the same way — scope the AC accordingly; this is a genuine open design question, not a
   "just mirror LCLI-40" mechanical port.
2. LCLI-52 (reconcile stale remark/unified doc references across ADRs/specs) — low priority,
   fully independent, ready to start. 8 files listed in the task description need their
   remark/unified framing corrected against actual shipped code (grep imports in src/).
```

## State

| Item | Status |
| --- | --- |
| `dev`/`main` | Unchanged since last handover, both `39bf00e`, no open PRs |
| LCLI-5 | In Progress; prior-art reply posted to issue #784 (comment `4998567172`); waiting on maintainer/lenucksi again |
| `backlog/tasks/lore-5 - ...md` | **Uncommitted** — this session's `--append-notes` edits (drift finding + posted-reply summary). Not committed per this skill's own rule (we're on `dev` directly, not a feature branch landing via PR) |
| LCLI-41, LCLI-52 | Untouched, To Do, ready — unchanged from prior handover |
| LCLI-53 | Still archived-as-duplicate, unchanged |

## Next steps

1. Check https://github.com/MrLesk/Backlog.md/issues/784 for a response before anything else on LCLI-5.
2. Commit the pending `backlog/tasks/lore-5 - ...md` change (or fold it into whatever commit closes out LCLI-5's next step) — it is currently sitting uncommitted on `dev`.
3. If LCLI-5 is still waiting, start LCLI-41 or LCLI-52 per the paste-ready prompt above.

## Critical context / traps

- **The scratch demo project used to generate the issue-#784 samples lived under the session
  scratchpad, not this repo** — if reproducing those samples again, don't run the fork CLI
  against the real lore `backlog/` (it would leak internal task titles/paths into a public
  GitHub comment); use a fresh `backlog init` in a throwaway dir instead, and sanitize any
  absolute `filePath` before posting.
- Confirmed (again) the fork checkout at `~/repos/Backlog.md` is a **symlink to
  `/Volumes/external`**, branch `tasks/back-510-json-output` @ `a80b7a1`, now 118 commits behind
  `upstream/main` / 3 ahead — don't rebase it until the contract from issue #784 is agreed.
- `commands/scaffold.ts` dispatches via a `BUILDERS` registry, not a ternary —
  `IMPLEMENTED_TARGETS` is *derived* from `BUILDERS`' keys specifically so LCLI-41 (or any future
  target) can't be added to one without the other.

## Do not repeat

- Tried writing a docusaurus-specific "freshly-created nested directory rolls back on a later
  failure" test mirroring mkdocs's own regression test — failed because ALL of docusaurus's
  files live inside the one new `website/` dir (unlike mkdocs, whose first file is at repo root),
  so the collision-injection trick leaves debris inside the tracked directory and the "dir was
  rolled back" assertion is wrong by construction. If LCLI-41's Obsidian scaffold has a similar
  all-nested-in-one-new-dir shape, don't retry this pattern — rely on the shared `writeAllOrRollback`
  primitive's existing generic coverage instead.
- `git push origin <branch>:main --ff-only` — `--ff-only` is not a valid `git push` flag; a plain
  `git push origin dev:main` already rejects a non-fast-forward update by default.

## System of record updated

- **LCLI-5** → notes appended twice: (1) the drift finding (maintainer had already replied to
  issue #784 before the prior handover was even written), (2) the outcome of posting our own
  reply (comment link, what was shared, the disclosed error-handling gap). Task left In Progress.
- **Issue #784** (external, not lore's system of record but worth noting) → new comment posted
  with prior art; not lore-owned, so no lore doc mirrors it — this handover is the only local
  record of the comment URL.
