# Handover — LCLI-38 (`lore help` + capability manifest) delivered as open PR #41, review-hardened, awaiting merge

**Date**: 2026-07-10 | **Grounded against**: `feat/lore-38-help-json` @ `0727858`; `dev` @ `3072a85` | **Backlog**: LCLI-38 (In Progress, both ACs checked)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

LCLI-38 (lore help + the `--json` capability manifest) is DONE and delivered as
PR #41 (feat/lore-38-help-json -> dev): OPEN, mergeable, all 4 CI checks green,
review-hardened over THREE /code-review rounds (9 -> 8 -> 2 findings, all fixed).
It is the user's to review/merge — do NOT self-merge.

Branch @ 0727858 (4 commits ahead of dev @ 3072a85). Working tree clean.

- If PR #41 is ALREADY MERGED when you resume: finalize LCLI-38 — mark it Done
  (`backlog task edit LCLI-38 -s Done`), then ff-push dev->main (main has no
  independent history; see the [[lore-finalize-shorthand]] memory), prune the
  branch. Then pick the next ship-sequence task.
- If STILL OPEN: hand it to the user to merge (or merge if they ask). Nothing
  code-wise is pending on it.

Then continue the "finish the backlog and ship" sequence the user asked for:
  command surface: LCLI-25 (lore tasks) -> LCLI-32 (orphans) -> LCLI-49
  (state.ts commit retrofit) -> LCLI-39/40 (scaffold mkdocs/docusaurus);
  then de-risk + ship: LCLI-14 (bun compile spike) -> LCLI-9 (release pipeline).
  Deferred/out of v1: LCLI-5, LCLI-41..45.
Recommended next pick: LCLI-25 (lore tasks) — independent of #41, branch off dev.
Ask the user which to pick, or proceed with LCLI-25.
```

## State

| Item | Status |
| --- | --- |
| PR #41 | **OPEN**, base `dev`, mergeable, 4 commits, all 4 CI checks pass (macos·ubuntu·windows + compile-smoke); no review decision yet — awaiting user merge |
| `feat/lore-38-help-json` | `0727858`, pushed (0/0 vs origin), 4 ahead of `dev` |
| LCLI-38 | In Progress; both ACs checked; → Done on merge |
| `dev` / `main` | `dev` @ `3072a85` (main behind by the LCLI-36 archive commit — normal pre-promotion state) |

## Next steps

1. Merge PR #41 (user's call) → then finalize LCLI-38 (mark Done; ff `dev`→`main`; prune branch).
2. Pick the next ship-sequence task — **LCLI-25 (`lore tasks`)** recommended (branch off `dev`; independent of #41).

## Critical context / traps

- **Exit codes in `src/core/manifest.ts` are DERIVED, not hand-listed.** `exitCodesFor(seams, extra)` over a `SEAM_CODES` map (loadBundle→{3,4,6}, readSource→{3,4}, loadProfile→{6}, fswrite→{4,5}, Backlog adapter→{3,6}, git→{6}). If you add/change a command or its filesystem behavior, update its **seam declaration** AND the **golden exitCodes test** in `test/help.test.ts` (transcribed from an authoritative call-chain trace). Never hand-enumerate codes — it drifted twice. A command's *principal* code (a gate/validation return, e.g. validate/check/new's `6`) is modeled as explicit `extra:[6]`, not a coincidental seam.
- **The manifest is self-contained** (no `LORE_COMMANDS` runtime import) to avoid a module-load crash. Add a new command to `LORE_MANIFEST` **in cli.ts dispatch order** (an order-sensitive test pins it) and keep its `summary` byte-identical to agent-bridge's `LORE_COMMANDS` (a drift-guard test enforces it).
- **The `USAGE` literal is retired**; `lore --help` and `lore help` both render from `renderTopLevelHelp(manifest)` and must stay byte-identical (a test guards it). Top-level help shows inline invocation signatures (from `command.args`).
- **`docs/reference/cli-contract.md` §2.1** is now the mirror of `lore help --json` (the authoritative registry of command kinds); `version`/`help` meta-flag kinds are documented as non-commands.
- Bidirectional lockstep test (`test/help.test.ts`) pins the manifest command set to the router's dispatch switch (forward: each advertised command dispatches; reverse: each `case` is advertised, order-sensitive).

## Do not repeat

- **Do NOT hand-list per-command exit codes** — round-1 and round-2 reviews both found them systematically wrong (under- AND over-reporting), because codes bubble from shared seams a per-file read misses. Derive from seams + golden test.
- **Do NOT derive the manifest from `LORE_COMMANDS` via a throwing `detailFor` at module load** — the round-1 "fix" for summary-drift did this and it crashed the ENTIRE CLI on a partial edit (module-load throw in cli.ts's import chain). Self-contained manifest + a test-time drift guard instead.
- **Do NOT call a review-hardened PR "ready to merge" without re-reviewing the FIXES** (not just the initial impl) — the user caught this; the re-review of the fixes found the whole systematic exit-code class. See [[rereview-fixes-and-derive-machine-contracts]].

## System of record updated

- **LCLI-38 task** → full review-trail notes across all 3 rounds; both ACs checked (committed to the branch, `0727858`).
- **CHANGELOG.md** → `## [Unreleased] → Added` entry for `lore help` (in the feat commit).
- **Auto-memory** → new [[rereview-fixes-and-derive-machine-contracts]] (re-review the fixes; derive machine contracts from traced seams + golden test); indexed in MEMORY.md.
