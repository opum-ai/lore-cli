# Handover — ship sequence: LORE-38 + LORE-25 shipped; next pick LORE-32 (orphans)

**Date**: 2026-07-10 | **Grounded against**: `dev` @ `11d4be0`; `main` @ `11d4be0` (equal) | **Backlog**: LORE-38 Done, LORE-25 Done; next = LORE-32

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

Two commands shipped and finalized this session — LORE-38 (`lore help` + capability
manifest, PR #41) and LORE-25 (`lore tasks`, PR #42). Both merged to dev, marked Done,
main ff'd to dev (both @ 11d4be0), branches pruned. Working tree clean. Nothing pending
on either.

Continue the "finish the backlog and ship" sequence the user is driving:
  command surface: LORE-32 (orphans) -> LORE-49 (state.ts commit retrofit) ->
  LORE-39/40 (scaffold mkdocs/docusaurus); then de-risk + ship: LORE-14 (bun compile
  spike) -> LORE-9 (release pipeline). Deferred / out of v1: LORE-5, LORE-41..45.

RECOMMENDED NEXT PICK: LORE-32 (`lore orphans`) — the bidirectional dangling-link
report that `lore tasks` (just shipped) defers to: tasks with no owning doc (no concept
lists them AND no task carries a `doc:` label) + docs whose `tasks:` ids Backlog no
longer knows. Read `backlog task view LORE-32 --plain` for ACs/deps; check its deps are
Done (via `backlog task view`, NOT grep — see [[backlog-dependency-grep-trap]]). Branch
off dev. cli-surface §orphans documents it: `kind: orphans.report` = { orphanTasks[],
danglingLinks[] }; exit 0 (report, not a gate). It reuses the SAME Backlog-adapter read
discipline as `lore tasks` — see the checklist below.

Follow the per-task loop: feature branch -> plan on the task -> implement -> gates
(bun test / biome check / tsc) -> workflow /code-review high -> fold fixes -> CHANGELOG
+ backlog notes/ACs -> PR into dev. The user reviews/merges (he authorized me to merge
#41 and #42 when he said so — ask per PR). On merge: mark Done, ff dev->main, prune,
archive this handover.
```

## State

| Item | Status |
| --- | --- |
| LORE-38 (`lore help`) | **Done** — merged via #41 |
| LORE-25 (`lore tasks`) | **Done** — merged via #42, review-hardened (9 findings: 5 fixed / 4 declined) |
| `dev` / `main` | both `11d4be0`, in sync; working tree clean |
| Next | LORE-32 (`orphans`) — To Do, branch off `dev` |

## Next steps

1. `backlog task view LORE-32 --plain`; verify deps Done; branch `feat/lore-32-orphans` off `dev`.
2. Implement `lore orphans` reusing `lore tasks`'s Backlog-adapter read discipline + the surface-coherence ripple checklist.
3. Gates → `/code-review high` → PR into `dev` (user merges).

## Critical context / traps  (all now captured in the [[lore-cli-command-pattern]] memory — read it)

- **Shipping a command is a surface-coherence RIPPLE, not just the command file.** Manifest entry (dispatch order, `exitCodesFor([seams])`) + golden exit-code row in `test/help.test.ts` + `LORE_COMMANDS` byte-identical summary + `bun src/cli.ts agents --force` (regen SKILL.md) + purge "aspirational/unshipped" claims/asserts (`manifest.ts`, `agent-bridge.ts`, `agents.test.ts`) + promote the `kind` from the "deferred" row in `cli-contract.md` §2.1. Lockstep/summary-drift/golden tests fail CI if any is missed.
- **`--json` `data` is object-wrapped, never a bare array** (`orphans.report` = `{orphanTasks[], danglingLinks[]}`) — additive-only contract. Ignore a stale cli-surface cell showing a bare array.
- **Backlog-adapter reads:** `adapter.probe()` UP FRONT (fail-fast 3/6); a later `viewTask`/`listTasks` null = soft dangling (advisory + exit 0), a throw = hard drift (rethrow). `allSettled` + first-in-order rethrow, not `Promise.all`. `fakeAdapter.probe` defaults to throwing — pass `{probe:"ok"}`/`{probe:Error}` to opt in (preserves link/rename's never-probe guard). NOTE: orphans likely needs `listTasks`/`searchByLabel` (reverse `doc:` lookup), which `fakeAdapter` currently stubs as `notImplemented` — extend the fake.
- **One declined review follow-up worth a task:** `readValue` (value-flag reader) is now duplicated across 5 commands (context/graph/query/schema/tasks) — a shared `args.ts` extraction is a clean cleanup task (cross-cutting, so its own focused review; [[batch-isolation-review-depth]]).

## Do not repeat

- **Do NOT hand-list per-command exit codes** — derive from seams + the independent golden row (they must agree; LORE-38 class of bug).
- **Do NOT ship a bare-array `--json` envelope** — object-wrap for additive-safety; verify against `query.results`/`graph.export`, not a doc cell.
- **Do NOT leave `fakeAdapter.probe` permissive for all callers** — a review round caught it dropping link/rename's never-probe guard; keep the throwing default, opt in per test.

## System of record updated (this session)

- **LORE-38, LORE-25 tasks** → Done, full notes/ACs/review trails (committed).
- **CHANGELOG.md** → Unreleased→Added entries for both `lore help` and `lore tasks`.
- **Docs** → `cli-contract.md` §2.1 (help.manifest + tasks.rollup now real kinds), `cli-surface.md` (tasks §), `instructions` linking topic.
- **Auto-memory** → [[lore-cli-command-pattern]] extended (surface-coherence ripple, adapter read discipline, object-wrapped envelope); [[rereview-fixes-and-derive-machine-contracts]] from LORE-38.
