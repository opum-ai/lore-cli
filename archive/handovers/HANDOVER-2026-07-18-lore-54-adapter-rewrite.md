# Handover — LORE-53 shipped and pushed; LORE-54 (full adapter rewrite) is next (LORE-54, LORE-5)

**Date**: 2026-07-18 | **Grounded against**: `dev` @ `0b27e47` (clean working tree, in sync with `origin/dev`, no open PRs) | **Backlog**: LORE-53 Done; LORE-54 To Do (unblocked); LORE-5 In Progress (umbrella, unchanged)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

Context: LORE-53 (migrate lore's Backlog.md capability probe from this fork's
--json shape to upstream's real shape, PR #790) is fully implemented, tested,
verified against a real build of the pinned upstream commit, committed
(f27f9ea "feat(LORE-53): migrate capability probe to upstream's --json
contract"), and pushed to origin/dev. Nothing pending from that task.

LORE-54 (rewrite src/adapters/backlog.ts's EnvelopeSchema/parseEnvelope/
listTasks/viewTask/searchTasks against upstream's real --json contract,
recapture golden fixtures, rewrite docs/reference/backlog-json-schema.md
§1-7) is now unblocked -- its only dependency, LORE-53, is Done.

Start here:
1. `backlog task edit LORE-54 -s "In Progress"`, read its full plain view
   (`backlog task view LORE-54 --plain`) for the 4 ACs.
2. Re-read docs/reference/backlog-json-schema.md §8 (the full envelope/kind/
   field/exit-code comparison table, fork vs. upstream) -- it's the contract
   of record for what LORE-54 migrates to.
3. Also re-read the now-updated docs/reference/backlog-cli-contract.md §5
   and docs/runbooks/backlog-json-patch.md §8.1 -- both describe exactly
   what LORE-53 already changed (the probe) and what's still pending here
   (the full adapter).
4. Before editing src/adapters/backlog.ts: grep every call site of
   EXPECTED_SCHEMA_VERSION, the EnvelopeSchema Zod union's kind literals
   ("taskList"/"task"/"searchResult"), and every `data` payload-key read,
   across both src/ and test/. LORE-53 found that the probe and a real
   listTasks() read hit the IDENTICAL `task list --json` subprocess call --
   LORE-54's blast radius is the whole adapter, so expect several more such
   collisions in the test harnesses (test/backlog-adapter.test.ts,
   test/backlog-json-golden.test.ts, test/support/record-backlog-goldens.ts)
   and trace before editing, not after.
5. viewTask's missing-task detection needs to flip from "empty stdout" to
   "exit code 1" (upstream's task view <missing> now exits 1 unconditionally,
   closing the gap this project's own issue #784 reply flagged upstream).
6. Recapture golden fixtures against a real pinned-upstream build once the
   adapter itself is rewritten -- the real-binary verification technique
   from LORE-53 (see Critical context below) is proven and directly reusable
   here, including for regenerating test/fixtures/backlog-json/*.json.
7. Rewrite docs/reference/backlog-json-schema.md §1-7 to describe upstream's
   shape as current (drop the "what's shipped in code today" framing) once
   the adapter migration lands.
```

## State

| Item | Status |
| --- | --- |
| `dev` | `0b27e47`, clean, **in sync with `origin/dev`** (pushed this session) |
| LORE-53 | **Done**, committed (`f27f9ea`) and pushed |
| LORE-54 | To Do, **unblocked** (depends only on LORE-53, now Done) |
| LORE-5 | In Progress; umbrella, unchanged |
| No open PRs, no feature branch | Both this session's commits went directly to `dev` (user's explicit instruction: "stage, commit, push") |

## Next steps

1. Start LORE-54: mark In Progress, read its full ACs (`backlog task view LORE-54 --plain`).
2. Re-read `docs/reference/backlog-json-schema.md` §8, `docs/reference/backlog-cli-contract.md` §5, and `docs/runbooks/backlog-json-patch.md` §8.1 before touching code.
3. Trace every call site of `EXPECTED_SCHEMA_VERSION` / the `EnvelopeSchema` Zod union's `kind` literals / `data` payload-key reads across `src/` and `test/` first — expect multiple shared-fixture collisions in the test harnesses, not just one.
4. Flip `viewTask`'s missing-task detection from empty-stdout to exit-code-1.
5. Recapture golden fixtures against a real pinned-upstream build (reuse the LORE-53 verification technique below).
6. Rewrite `docs/reference/backlog-json-schema.md` §1-7 once the adapter migration lands.

## Critical context / traps

- **`EXPECTED_SCHEMA_VERSION` (string `"1"`) and `PROBE_SCHEMA_VERSION` (number `1`, new in LORE-53) are deliberately separate constants** in `src/adapters/backlog.ts`. LORE-54 is exactly the task that should finally retire `EXPECTED_SCHEMA_VERSION`'s fork-shaped usage — once `EnvelopeSchema`/`parseEnvelope` are rewritten onto upstream's shape, consider whether the two constants can merge (they should end up representing the same numeric `1`) or whether `PROBE_SCHEMA_VERSION` should simply be deleted in favor of the (now-migrated) shared one. Same applies to `TASK_LIST_KIND` (`"task-list"`, LORE-53) vs. the still-fork-shaped `"taskList"` literal hardcoded in the `EnvelopeSchema` Zod union.
- **The probe and a real `listTasks()` read issue the identical `["task", "list", "--json"]` argv.** `test/backlog-adapter.test.ts`'s `defaultProbe()` currently disambiguates by call order (first match → upstream-shaped `PROBE_ENVELOPE`, later match → the old fork-shaped `TASK_LIST` golden) specifically so LORE-53 didn't have to touch LORE-54's territory. Once LORE-54 migrates the real read too, this whole test harness distinction can likely collapse back to one shared upstream-shaped fixture — don't leave the two-tier fake in place after both sides target the same contract.
- **Real-binary verification technique (proven in LORE-53, reuse directly):** clone `MrLesk/Backlog.md` into scratch, checkout the pinned commit (`22a091b570d44c4f302ca47e7fd36fa28ad8bcb0`), `bun install`, run **interpreted** (`bun src/cli.ts ...`) — not `bun build --compile`, which silently fails on this repo's external-volume checkout ([[external-volume-bun-exdev-traps]]). `--version` needs `cwd` = upstream's own checkout dir (its `getVersion()` reads `package.json` from `cwd` when there's no build-embedded version — a wrong `cwd` silently returns whatever *that* directory's `package.json` says, which is how LORE-53 briefly chased a phantom "reports an unreleased version below the floor" bug). Real project reads (`task list --json`, `task view <id> --json`, `search`) need `cwd` = the real target project.
- **No `package.json` dependency exists** (explicit decision on LORE-53: lore hasn't shipped, so a manually-built pinned-commit binary is enough for dev/test; real dependency wiring is deferred to whenever a tagged upstream release ships). Nothing for LORE-54 to change here unless that release lands first.

## Do not repeat

- Don't reuse a single shared schema-version/kind constant across the probe and the full adapter while they're on different contracts — LORE-53 already hit this (see above) and split them; LORE-54 is the task that gets to un-split them once both sides agree.
- Don't verify contract-shape acceptance criteria with fake-spawn unit tests alone when the AC says "against a real build" — LORE-53's real clone+build+run caught a `cwd`-dependent verification bug that unit tests alone missed; budget the same real-binary step for LORE-54's golden-fixture recapture.

## System of record updated

- **LORE-53** → Done, with full plan/notes/ACs/final-summary (see task history for detail); no further action needed on it.
- **Git**: `f27f9ea` (LORE-53 implementation) and the prior handover-archive commit both pushed to `origin/dev` this session, per explicit user instruction ("stage, commit, push").
- **Old handover archived**: `HANDOVER-2026-07-18-lore-53-done-lore-54-next.md` → `archive/handovers/` (its "ask the user about commit/push" step is resolved — done, this handover).
