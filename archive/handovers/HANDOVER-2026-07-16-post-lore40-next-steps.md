# Handover — LORE-40 shipped; pick next: LORE-41 / LORE-52 / LORE-5 (blocked)

**Date**: 2026-07-16 | **Grounded against**: `dev`/`main` both @ `39bf00e` (clean, no open PRs) | **Backlog**: LORE-40 Done; LORE-52/53 dedup fixed; LORE-5 In Progress (blocked, external); LORE-41 next candidate

## Paste-ready prompt for the next session

```
LORE-40 (lore scaffold docusaurus) shipped via PR #49, merged to dev and promoted to main
(both at 39bf00e). Along the way this session also fixed a stale LORE-52/53 duplicate-task-ID
collision (unrelated drift found during a handover restore) and verified release.yml's first
real GitHub Actions run (LORE-9's last open unknown, now resolved).

FIRST run `backlog instructions overview`.

Nothing is in flight. Pick one:

1. LORE-41 (lore scaffold obsidian) — the natural next consumer-scaffolding target, same
   shape as LORE-39 (mkdocs)/LORE-40 (docusaurus): a .obsidian/ vault config, additive outside
   docs/. Mirror src/core/consumer-scaffold.ts's buildMkdocsScaffold/buildDocusaurusScaffold
   pattern, and commands/scaffold.ts's BUILDERS registry (LORE-40 replaced a two-armed ternary
   dispatch with a registry map specifically so a third target can't silently misroute — adding
   "obsidian" to BUILDERS is now the only wiring point; IMPLEMENTED_TARGETS is derived from it).
   No CI build-smoke precedent exists for Obsidian (unlike mkdocs/docusaurus's real-build CI
   jobs), since Obsidian isn't CLI-scriptable the same way — scope the AC accordingly; this is a
   genuine open design question, not a "just mirror LORE-40" mechanical port.
2. LORE-52 (reconcile stale remark/unified doc references across ADRs/specs) — low priority,
   fully independent, ready to start. 8 files listed in the task description need their
   remark/unified framing corrected against actual shipped code (grep imports in src/).
3. LORE-5 stays blocked — waiting on maintainer response to the scope-discussion issue
   (https://github.com/MrLesk/Backlog.md/issues/784). Check the issue for a response before
   doing anything else on this task; do not open an upstream PR before that discussion resolves.
```

## State

| Item | Status |
| --- | --- |
| PR #49 (LORE-40) | Merged `5e0e6c8` (squash, admin) → dev; task Done |
| `dev` → `main` promotion | Fast-forward pushed; both at `39bf00e` |
| Feature branch `feat/lore-40-docusaurus-scaffold` | Deleted (local + remote) |
| LORE-52/53 duplicate-ID collision | Repaired (`backlog doctor --fix --yes`); LORE-53 archived as a duplicate of LORE-52 |
| `release.yml` first real run | Passed clean (run `29502019960`) — LORE-9's last open unknown, resolved |

## Next steps

1. Pick one of LORE-41 / LORE-52 / (LORE-5 if unblocked) per the paste-ready prompt above.
2. If starting LORE-41, first settle whether Obsidian's AC can be verified programmatically at
   all (Obsidian has no CLI build step the way mkdocs/docusaurus do) before committing to a
   CI-smoke-test shape.

## Critical context / traps

- **`gh pr merge <n> --delete-branch` silently repoints the current local checkout to the
  default branch** (confirmed again this session) — if a future session runs this from a
  feature-branch checkout, verify `git branch --show-current` immediately after.
- **A Backlog task ID collision can happen when a session "recreates" a task instead of
  finding an existing one** — this bit LORE-52 twice now (once creating the duplicate, once
  discovering and fixing it later). If `backlog task view LORE-N --plain` errors with an
  ambiguous-ID message, resolve it immediately via `backlog doctor --fix --yes`, don't work
  around it.
- **`commands/scaffold.ts` now dispatches via a `BUILDERS` registry, not a ternary** —
  `IMPLEMENTED_TARGETS` is *derived* from `BUILDERS`' keys specifically so LORE-41 (or any
  future target) can't be added to one without the other.

## Do not repeat

- Tried writing a docusaurus-specific "freshly-created nested directory rolls back on a later
  failure" test mirroring mkdocs's own regression test (forcing the SECOND planned file,
  `docusaurus.config.js`, to collide) — failed because ALL of docusaurus's files live inside the
  one new `website/` dir (unlike mkdocs, whose first file is at repo root, outside `docs/`), so
  the collision-injection trick leaves debris inside the tracked directory and the "dir was
  rolled back" assertion is wrong by construction. Removed the test; the shared
  `writeAllOrRollback` primitive's rollback behavior is already covered generically by mkdocs's
  own tests. If LORE-41's Obsidian scaffold has a similar all-nested-in-one-new-dir shape, don't
  retry this pattern — rely on the shared-primitive coverage instead.
- `git push origin <branch>:main --ff-only` — `--ff-only` is not a valid `git push` flag; a
  plain `git push origin dev:main` already rejects a non-fast-forward update by default. Don't
  add `--ff-only` when promoting dev to main.

## System of record updated

- **LORE-40** → Done, with full implementation notes + final summary naming PR #49, the
  `/code-review max` fold, and two real `docusaurus build` verifications (local scratch +
  the new `scaffold-docusaurus` CI job).
- **LORE-52/53** → collision repaired; LORE-53 archived with notes explaining the dedup; LORE-52
  annotated with the resolution provenance.
- **LORE-9** → notes appended recording `release.yml`'s first successful real CI run.
- **CHANGELOG.md** → LORE-40 entry added (Unreleased → Added).
- **`docs/reference/consumer-compatibility.md`, `docs/reference/cli-surface.md`** → corrected the
  ESM→CJS `docusaurus.config.js`/`sidebars.js` snippet and removed LORE-40's "(pending)" markers.
- **Auto-memory** → no new memories needed; `lore-40-docusaurus-cjs-config` was verified accurate
  and consumed as designed — a prior spike's finding successfully informed this session's
  implementation.
