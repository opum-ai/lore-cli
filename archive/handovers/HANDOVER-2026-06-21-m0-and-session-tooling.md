# Handover — M0 foundation shipped (PRs #1–#3) + session-continuity tooling (PR #4); next: merge the stack, continue M0 (LCLI-10/11/12)

**Date**: 2026-06-21 | **Grounded against**: lore — `dev`=`6d9a461`, HEAD `chore/eck-session-handover`=`86ceeab` | **Backlog**: LCLI-6/7/8 Done; LCLI-10/11/12 next

## Paste-ready prompt for the next session

```
Continue building lore (OKF-native docs CLI, Bun+TS). Read docs/runbooks/dev-kickoff.md for the constraints.

FIRST, confirm the M0 foundation landed. It's in 3 stacked PRs awaiting YOUR merge — I do not self-merge:
- Merge in order #1 -> #2 -> #3 (github.com/jeremy-newhouse/lore/pull/1 .. /3), deleting each head branch on merge so the next PR auto-retargets to dev.
- PR #4 (ECK session-handover tooling) is independent (base dev) — merge or close per your call.
Check: `git fetch && git rev-parse --short origin/dev` should be PAST 6d9a461 once merged.

THEN continue M0 off the updated dev. Same workflow: one feature branch per task -> PR into dev; you review/merge (NEVER self-merge). Next unblocked M0 tasks (do LCLI-11 first — LCLI-15 depends on it):
- LCLI-11: shared error model, exit codes (0/2/3/4/5/6), warning collector — ADR-0005, docs/reference/cli-contract.md
- LCLI-10: .lore config loader (native Bun TOML + env overlay) — ADR-0013, tech-stack §8
- LCLI-12: output layer (--plain / --json envelope {schemaVersion,kind,data} / pretty) — ADR-0004, ADR-0005
Claim each: `backlog task edit LORE-N -s "In Progress" -a @claude`; finish: Done + --final-summary + CHANGELOG (Unreleased). Keep core/ a library returning structured objects; commands thin.

TOOLCHAIN: Bun 1.2.23 at ~/.bun/bin/bun. PATH is NOT persisted across Bash calls — prefix every bun command with: export PATH="$HOME/.bun/bin:$PATH". Gates: bun run lint (Biome), bun run typecheck (tsc), bun test. Repo lives on /Volumes/external (external volume): `bun install --linker=isolated` fails LOCALLY with EXDEV (cross-device clonefile) — use a plain `bun install` locally; CI uses isolated and passes.

BJP track (LCLI-1: fork MrLesk/Backlog.md -> jeremy-newhouse/Backlog.md, add --json) is still NOT started — it's outward-facing (creates a public repo under your account) and needs your explicit go-ahead. M2 (LCLI-21 backlog.ts adapter) is BLOCKED on it + M1.
```

## State

| Item | Status |
| --- | --- |
| PR #1 — `chore/lore-6-scaffold` → `dev` (LCLI-6 scaffold) | open, MERGEABLE; no CI (ci.yml not on this branch) |
| PR #2 — → #1 (LCLI-7 Biome + bun test) | open, MERGEABLE; no CI on branch |
| PR #3 — → #2 (LCLI-8 CI) | open, MERGEABLE; **CI green 4/4** (ubuntu/macos/windows + compile smoke) |
| PR #4 — `chore/eck-session-handover` → `dev` (ECK handover/recovery) | open, MERGEABLE; no CI (independent of M0) |
| `dev` | unchanged @ `6d9a461` — **M0 not merged yet** |
| LCLI-6 / LCLI-7 / LCLI-8 | **Done** (ACs checked, final summaries) |
| LCLI-10 / LCLI-11 / LCLI-12 | To Do (M0 / m-1, unblocked) |
| LCLI-1 (BJP fork) | To Do — **not started**, needs your go-ahead (outward-facing) |

## Next steps

1. **(You)** Merge PRs #1 → #2 → #3 into `dev` in order (delete branches to auto-retarget #2/#3); decide merge-or-close on PR #4.
2. **(You)** Activate the new hooks: open `/hooks` once **or** start a fresh session — they're configured but the settings watcher didn't load the brand-new `.claude/settings.json` mid-session.
3. Continue M0 off the merged `dev`: **LCLI-11 → LCLI-10 → LCLI-12** (feature branch + PR each).
4. When ready to unblock M2: give the go-ahead for the BJP fork (LCLI-1).

## Critical context / traps

- **CI only runs where `ci.yml` is present.** It was added in LCLI-8 (PR #3's branch), so PRs #1/#2 report "no checks" and PR #4 (off `dev`) has none. PR #3's green run covers the cumulative #1+#2+#3 tree. Once M0 merges to `dev`, CI gates all future PRs. This is expected, not a failure.
- **Bun PATH**: `~/.bun/bin/bun` is not on PATH in fresh Bash calls — prefix `export PATH="$HOME/.bun/bin:$PATH"`.
- **EXDEV**: repo on `/Volumes/external`; `bun install --linker=isolated` fails locally (cross-device clonefile). Use plain `bun install` locally; CI (single filesystem) uses isolated fine.
- **Branch state**: working tree is currently on `chore/eck-session-handover` (off `dev`, so it lacks the M0 `src/`+`package.json`). To resume M0, branch off the **merged** `dev`; if not yet merged, branch off `chore/lore-8-ci` (the M0 stack tip @ `226d375`).
- **Backlog writes via the `backlog` CLI only**; never hand-edit `backlog/**`. lore is the sole committer of `backlog/` (auto_commit stays false).
- **Do not self-merge** PRs — the user reviews and merges.

## Do not repeat

- `bunx .` does **not** work — Bun's `bunx` is registry-only (errors `unrecognised dependency format: @.`). Use `bun .` / `bun run lore` / `bunx lore` (after `bun link`).
- Don't chase `bun install --frozen-lockfile --linker=isolated` failing locally — it's the external-volume EXDEV, not a config bug (CI passes).
- Don't expect newly-wired hooks to be live immediately — a new `settings.json` needs `/hooks` or a restart for the watcher to load it.

## System of record updated

- **None new this session** — LCLI-6/7/8 were already finalized in Backlog (notes + final summaries); the ECK wiring is documented in PR #4 and commit `86ceeab`; the branch-per-task/PR-into-dev/user-merges preference is saved to auto-memory (`lore-git-workflow`).
