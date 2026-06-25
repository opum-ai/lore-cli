# Handover — LORE-19 `lore validate` landed; next up an unblocked m-2 task (LORE-19 Done)

**Date**: 2026-06-25 | **Grounded against**: `dev`=`45f35d2` (==origin/dev) | **Backlog**: LORE-19 **Done**; next = LORE-46 or LORE-20 (both **To Do**)

## Paste-ready prompt for the next session

```
LORE-19 (`lore validate`) is DONE and merged to dev (PR #16, squash 97ed51c; task-state
commit 45f35d2). dev is at 45f35d2 == origin/dev, clean tree, no open PRs. lore now ships
init → new → validate.

Per CLAUDE.md, FIRST run `backlog instructions overview`. Then pick the next task — DO NOT
start coding before confirming scope with Jeremy:

  RECOMMENDED next (unblocked, deps satisfied — both depend only on LORE-15, which is Done):
    • LORE-46 (HIGH) — Declarative .lore profile: per-project type vocabulary, schemas &
      templates. Strategically important: the ECK⇄Lore integration path is "ECK integrates
      via CLI/--json + a declarative .lore/profile" ([[eck-lore-alignment]]). Bigger design task.
    • LORE-20 (MEDIUM) — `lore schema export` (Zod → JSON Schema + modeline). Smaller; note
      init.ts ALREADY emits .lore/schemas/ (jsonSchemaFor/schemaModeline in schema.ts), so this
      is likely a thin standalone `lore schema` command surfacing that — confirm what it OWNS
      vs what init already does before scoping.

  DO NOT pick the coupling/coherence layer yet — it is BLOCKED:
    • LORE-21 (backlog.ts adapter) depends on the Backlog.md fork shipping --json (LORE-1..5,
      all To Do).
    • LORE-27 (`lore check` drift gate) is m-3 and depends on LORE-22 (managed-block) + LORE-23
      (reconcile), which in turn need the adapter. So `lore check` is several tasks out.

  Ask Jeremy which to take (default to the highest-priority unblocked m-2 task = LORE-46).
  Then `backlog task view LORE-N --plain`, read its Documentation pointers, branch
  feat/lore-N-<slug> off dev, plan via `backlog task edit LORE-N --plan` (task-execution
  workflow), implement, gate, PR into dev, hand back (no self-merge).

Gates: bun test + biome lint + tsc typecheck + coverage → `/code-review max` → PR into dev.
All commits end with `Co-Authored-By: Claude Opus 4.8 (1M context)`.
```

## State

| Item | Status |
| --- | --- |
| LORE-19 | **Done** — `lore validate` delivered via PR #16 (squash `97ed51c`); both ACs checked; full `/code-review max` disposition in task notes |
| `dev` | `45f35d2` == origin/dev (squash merge + `chore(LORE-19) mark Done` + archived handover). Clean tree |
| feature branch | none (feat/lore-19-validate deleted, remote + local) |
| LORE-46 | **To Do** (HIGH, m-2, dep LORE-15 ✓) — declarative .lore profile |
| LORE-20 | **To Do** (MEDIUM, m-2, dep LORE-15 ✓) — schema export |
| m-3 (LORE-21/27 …) | **Blocked** on the Backlog.md fork (LORE-1..5) + LORE-22/23 |

## Next steps

1. `backlog instructions overview` → confirm next task with Jeremy (LORE-46 vs LORE-20) → `backlog task view LORE-N --plain` + read its docs.
2. Branch `feat/lore-N-<slug>` off `dev`. Plan via `backlog task edit LORE-N --plan` before coding.
3. Build pure logic in `core/`, thin I/O in `commands/`, wire into the `dispatch` switch + USAGE in `src/cli.ts` (the init/new/validate pattern).
4. Gates → `/code-review max` → PR into dev → hand back (no self-merge).

## Critical context / traps

- **ssh-agent is DOWN** (SSH push → `Permission denied (publickey)`). Route git writes via the gh
  token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`
  then `git update-ref refs/remotes/origin/<branch> <sha>`. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]].
- **Admin-merge recovery (ssh down)** — used cleanly on #16 this session: `gh pr merge <n> --squash
  --admin` (NO `--delete-branch` — it triggers a local `dev` ff over SSH and strands you on stale
  local dev). After merge: STASH any post-commit `backlog/**` edits first (an uncommitted task-note
  blocks `git checkout dev`), then gh-token `fetch …/lore.git dev`, `git checkout dev`, `git merge
  --ff-only FETCH_HEAD`, `git update-ref refs/remotes/origin/dev <sha>`, `git stash pop`, mark task
  Done + archive handover, commit, push dev, delete remote branch via `gh api -X DELETE
  repos/jeremy-newhouse/lore/git/refs/heads/<branch>`.
- **CLI arg-model convention (src/cli.ts, set by LORE-18, reused by validate)**: global flags
  (`--json/--plain/-v/--version/-h/--help`) stripped in any position; FIRST positional is the
  command; everything after → `commandArgs` for the command to parse. A value-taking command flag
  (`--type`) must refuse a following flag-looking token as its value; `--` ends option parsing;
  version/help/no-command short-circuit calls `rejectStrayCommandFlags`. A no-arg command uses
  `rejectCommandArgs`. Follow this for any new command.
- **core/ stays PURE** (lore-design §2.1): no fs/print/flags/process.exit in core; inject
  clock/streams. **No Commander** (EXDEV / CI isolated-linker traps, [[external-volume-bun-exdev-traps]]).
- **Reusable validate-layer assets now in place**: `core/validate.ts` is the pure aggregating
  reporter (`validateConceptText`/`validateFiles`/`quoteSafetyFindings`); `schema.ts`
  `requiredSectionsFor` is the single source of truth for per-type required sections;
  `bundle.ts` now **exports `walkMarkdown`** (dir walk) and **`walkMdast`** (stack-safe AST walk) —
  reuse them, don't re-roll. A gate command emits its report to stdout and **returns** exit 6
  (it does NOT throw for a content failure — only usage/I-O throw). [[lore-serialization-invariants]].
- **On `/Volumes/external`**: `bun build --compile` can silently emit a 0-byte binary; recompile on
  the internal disk to rule out the external-volume trap before chasing a "broken binary".
  [[external-volume-bun-exdev-traps]].

## Do not repeat

- **Don't self-merge** unless Jeremy explicitly says "admin-merge" / "merge" ([[lore-git-workflow]]).
- **A per-type FILTER on a gate must never drop error/unparseable items** — they have no confirmed
  type, so filtering them out silently narrows the gate (this was the dominant `/code-review max`
  finding on LORE-19: `--type` dropped malformed files → gate went green over broken concepts).
  Keep error files always; recover their type for display only.
- **Quote-safety / any raw-frontmatter line scan must strip trailing YAML comments** before judging
  a value (` # …` after whitespace), or a colon-in-comment false-errors a valid file.
- **Don't bare `git push`/`git fetch`** while ssh is down — gh-token route from the start.
- **Re-run the full cli.test suite after touching the shared CLI parser** — it is shared by every command.

## System of record updated (this session)

- **LORE-19** → **Done** (commit `45f35d2`): both ACs checked; notes capture the delivery, the two
  PR commits (feature `b0c87c5` + `/code-review max` fixes `83e7d09`, squashed to `97ed51c`), the
  13-confirmed-finding review disposition, and the 3 accepted-as-intended items.
- **dev** → `45f35d2`: squash merge of #16 + `chore(LORE-19) mark Done` + archived handover.
- **CHANGELOG.md** (Unreleased) → `lore validate` entry (tiers, required-sections policy, quote-safety, AC#2).
- **Prior handover** `HANDOVER-2026-06-25-lore-18-landed.md` → archived to `archive/handovers/` (consumed; committed in `45f35d2`).
