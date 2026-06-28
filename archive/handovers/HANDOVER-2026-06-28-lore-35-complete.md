# Handover — LORE-35 refactoring trio COMPLETE; next: backlog-fork chain or standalone graph commands

**Date**: 2026-06-28 | **Grounded against**: `dev`=`1759f7b` (== origin, clean tree, dev checked out) | **Backlog**: LORE-35 **Done** (all of .1/.2/.3 Done)

## Paste-ready prompt for the next session

```
State: dev == origin/dev == 1759f7b, clean, no open PRs. main is BEHIND at b4e5912 (not promoted —
promote with a ff only if asked). LORE-35 (lore replace/rename/supersede) is fully DONE: .1 #22, .2 #23,
.3 #24 (squash c018fe7), parent LORE-35 Done. The shared pure engine core/rewrite.ts rewriteInbound now
carries `rewriteFrontmatterRefs` (default true) + `exclude` options; bundle.ts exports conceptNotInBundle.
FIRST run `backlog instructions overview`, then pick the next task and `backlog task view <id> --plain`.

No work is mid-flight. Two candidate fronts (ask the user which):
  1) backlog-fork chain (HIGH, the critical path): LORE-1 (fork Backlog.md + --json task) → LORE-2
     (shared task-json serializer + --json on read cmds) → LORE-21 (backlog.ts adapter: JSON read / CLI
     write) → LORE-22 (managed-block.ts task block) → LORE-23 (reconcile rollup) → LORE-24 (link/unlink)
     → LORE-26 (sync) / LORE-27 (check drift gate). This unblocks the doc↔task coupling; everything here
     is blocked behind LORE-1. Verify deps with `backlog task view --plain` (NOT grep — see memory).
  2) standalone graph/query commands that need no fork: LORE-31 (lore graph), LORE-32 (orphans),
     LORE-33 (lore query), LORE-20 (lore schema export), LORE-25 (lore tasks), LORE-36 (lore agents).
     These read the existing bundle graph and ship like LORE-35's commands did.

Per-task workflow (proven across #22/#23/#24): feature branch off dev → implement (thin command over a
pure core/ engine) → gates: `bun test` + `bunx biome check src/ test/` + `bunx tsc --noEmit` +
`bun test --coverage` (core 100% func) → `/code-review max` and FOLD verified findings (it found 11/15/15
data-loss-grade bugs in the three; budget a real fold pass) → PR into dev via gh token. Jeremy reviews;
admin-merge ONLY when he says "admin-merge".
```

## State

| Item | Status |
| --- | --- |
| **LORE-35** (replace/rename/supersede) | **Done** — parent + all 3 subtasks |
| LORE-35.1 / .2 / .3 | **Done** — #22 `89330e4` / #23 `d85fd2c` / #24 `c018fe7` |
| `dev` | `1759f7b` == origin; clean; **dev checked out** |
| `main` | `b4e5912` — **behind dev**, not promoted (promote via ff only if asked) |
| Open PRs | **none** |
| Feature branches | **all pruned** (merged #24 branch + 7 stale tracking refs) |
| backlog-fork cluster (LORE-1/2/21/22/23/24/26/27) | **To Do, HIGH** — blocked behind LORE-1 fork |
| standalone graph cmds (LORE-31/32/33/20/25/36) | **To Do** — no fork dependency |

## Critical context / traps

- **rewriteInbound is now multi-tenant**: `core/rewrite.ts` serves rename (`move:true`) and supersede
  (`move:false`, `rewriteFrontmatterRefs:false`, `exclude` set). Any new graph command reusing it gets
  these knobs. See [[rewriteinbound-shared-engine-traps]].
- **Root `docs/index.md` IS a concept** (has `okf_version`) — it loads into `graph.concepts`. Graph-aware
  writes must guard reserved stems (`index`/`log`) as principals and exclude them, or they corrupt the
  machine-owned hub. This bit supersede; it will bit `lore sync`/`graph`/`query` too.
- **ssh-agent is DOWN** (publickey denied). Route ALL git network ops via the gh token:
  `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <b>:<b>`
  then `git update-ref refs/remotes/origin/<b> <sha>`. ff: gh-token `fetch …/lore.git <ref>` →
  `git merge --ff-only FETCH_HEAD` → `update-ref`. Prune stale tracking refs with
  `git -c credential.helper=… fetch --prune …/lore.git "+refs/heads/*:refs/remotes/origin/*"`.
  `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]]
- **Merge convention = SQUASH** → one `feat(LORE-N): … (#NN)` on dev; post-merge `chore(LORE-N): mark Done`.
- **Read task deps via `backlog task view --plain`**, never grep `backlog/tasks/*.md` ([[backlog-dependency-grep-trap]]).

## Do not repeat

- **Don't treat supersede like rename-without-the-move** — that uniform inbound rewrite (now fixed)
  fabricated false history in preserved third-party lifecycle refs and clobbered the old doc's
  `superseded_by`. Engine options + the conflict guard now prevent it; new graph commands must respect
  the same preserved-file semantics.
- **Don't skip `/code-review max`** on a graph-refactor command — 11/15/15 data-loss bugs across the trio.
- **Don't promote `main`** unless asked (it's intentionally behind at b4e5912 this session).

## System of record updated (this session)

- **LORE-35.3 → Done**; ACs #1/#2 checked; notes record the implementation + the folded #24 `/code-review
  max` cluster (15 confirmed). **LORE-35 parent → Done** (all subtasks delivered).
- **CHANGELOG.md** (on dev): `lore supersede` Added entry, corrected to the post-fold behavior.
- **Code on dev** (`c018fe7`): NEW `commands/supersede.ts`; `core/rewrite.ts` gained
  `rewriteFrontmatterRefs`+`exclude`; `core/bundle.ts` exports `conceptNotInBundle`; `cli.ts` registers
  `supersede`; `test/supersede.test.ts` + 2 engine-option tests in `test/rename.test.ts`.
- **Auto-memory**: added [[rewriteinbound-shared-engine-traps]] (+ MEMORY.md index line).
- This handover **supersedes** the consumed `HANDOVER-2026-06-28-lore-35.3-supersede.md` (archived).
