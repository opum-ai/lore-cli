# Handover — LCLI-49 shipped; next in the ship sequence is LCLI-39/40 (scaffold)

**Date**: 2026-07-11 | **Grounded against**: `dev` @ `a10bac4`; `main` @ `a10bac4` (equal) | **Backlog**: LCLI-49 Done; next = LCLI-39/40

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

LCLI-49 (retrofit link/unlink/rename to commit backlog/ via state.ts) is DONE and
merged: PR #44 squash-merged to dev (a10bac4), main fast-forwarded to dev (both
a10bac4), feat/lore-49-commit-backlog-writes pruned, task marked Done. Working tree
clean. It shipped WITH a post-merge `/code-review max` hardening fold (9 findings:
report-on-commit-failure capture, :(literal) pathspec scoping, shared
renderBacklogCommitLine, scope guard, +8 tests) — all in the squashed commit. Nothing
pending on LCLI-49. See [[backlog-commit-seam]] for the invariants that fold locked in.

Continue the "finish the backlog and ship" sequence the user is driving:
  RECOMMENDED NEXT: LCLI-39 (`lore scaffold mkdocs`) then LCLI-40 (`lore scaffold
  docusaurus` + a build smoke test) — the two remaining command-surface features.
  Then de-risk + ship: LCLI-14 (Bun compile compatibility spike, LOW) -> LCLI-9
  (release pipeline: compiled binaries + dual-artifact npm publish). LCLI-5 (open the
  upstream --json PR + migrate lore) is gated on the release. Deferred/out-of-v1:
  LCLI-41 (obsidian), 42 (mcp), 43/44 (Confluence), 45 (importable lib).
  ALSO AVAILABLE: LCLI-51 (LOW cleanup) — dedup the task-summary-row TYPE + aligned-row
  renderer across tasks.ts/orphans.ts (carries the Math.max spread-free-maxLen note for
  tasks.ts). NOTE: LCLI-49 already extracted the *backlog-commit* line renderer
  (renderBacklogCommitLine); LCLI-51 is the SEPARATE task-summary-row dedup.

Per-task loop: `backlog task view LORE-N --plain` (verify deps Done via task view, NOT
grep — [[backlog-dependency-grep-trap]]) -> branch off dev -> plan on the task ->
implement -> gates (bun test / bunx biome check src test / bunx tsc --noEmit / bun
src/cli.ts check) -> workflow `/code-review high` (or max for surface-coherence work)
-> fold fixes -> CHANGELOG + backlog notes/ACs -> PR into dev. The user reviews/merges;
he authorizes the merge explicitly (this session he said "merge ... promote to main").
On merge, finalize: mark Done + commit on the branch (committed BEFORE merge so a
dev-sync reset can't wipe it — [[dev-sync-reset-wipes-backlog-edits]]), squash-merge
--admin, ff dev->main, prune, archive this handover.
```

## State

| Item | Status |
| --- | --- |
| LCLI-49 (`commitBacklogFiles`) | **Done** — merged via #44 (`387f3b9`), review-hardened (9 findings folded, +8 tests) |
| `dev` / `main` | both `a10bac4`, in sync; working tree clean; feature branch pruned |
| Gates on merged tree | 1433 tests, biome 0, tsc clean, `lore check` 0/0 |
| Next | LCLI-39 (`lore scaffold mkdocs`) — To Do, branch off `dev` |
| Also queued | LCLI-40, LCLI-14, LCLI-9, LCLI-5; LCLI-51 (LOW cleanup) |

## Next steps

1. `backlog task view LCLI-39 --plain` (and LCLI-40); confirm deps Done; branch `feat/lore-39-scaffold-mkdocs` off `dev`.
2. Implement `lore scaffold`; `scaffold.result` is the `kind` already sitting DEFERRED in `cli-contract.md` §2.1 — promote it when the command ships (surface-coherence ripple — see [[lore-cli-command-pattern]]).
3. Gates -> `/code-review high` -> PR into `dev` (user merges).

## Critical context / traps

- **`scaffold.result` is a deferred `kind` in cli-contract §2.1** — shipping LCLI-39/40 is a surface-coherence RIPPLE (cli.ts dispatch + manifest entry with `exitCodesFor([seams])` + `test/help.test.ts` golden exit-code row + `LORE_COMMANDS` byte-identical summary + `bun src/cli.ts agents --force` to regen SKILL.md + `test/agents.test.ts` phantom-list + promote the kind). The order-sensitive lockstep test pins manifest order == cli.ts switch order — insert in the SAME slot both places. ([[lore-cli-command-pattern]])
- **LCLI-40 wants a build smoke test** (docusaurus actually builds) — that likely needs node/npm in CI; budget for the external-volume Bun/EXDEV + CI isolated-linker traps ([[external-volume-bun-exdev-traps]]).
- **backlog on PATH is stock v1.47.1** (no `--json`) — a live command that reads Backlog fails the probe exit 6; tests use the injected `fakeAdapter`. ([[backlog-md-integration-contract]])
- **`--json` data is object-wrapped, never a bare array** — additive-safety contract.

## Do not repeat

- **Do NOT re-litigate LCLI-49's accepted-by-design item**: the new hard git dependency (link/unlink/rename now shell git for any real back-ref write, so a non-git repo exits 6 where it previously exited 0) is accepted — consistent with sync + ADR-0012; running outside a git repo was never a supported lore workflow. Recorded in the LCLI-49 task notes.
- **Do NOT hand-list per-command exit codes or ship a bare-array `--json`** — derive codes from seams + the golden row; object-wrap the envelope.
- **Do NOT leave a backlog task's Done/notes uncommitted across a merge** — a dev-sync `git reset --hard` wipes them; commit onto the branch first ([[dev-sync-reset-wipes-backlog-edits]]).

## System of record updated (this session)

- **LCLI-49 task** → Done; notes appended with the full `/code-review max` disposition (8 fixed + 1 accepted-by-design), committed pre-merge so the reset couldn't wipe it.
- **CHANGELOG.md** → the LCLI-49 "Changed" entry updated with the `:(literal)` scoping + capture-not-throw report behavior.
- **Auto-memory** → new [[backlog-commit-seam]] (state.ts commit invariants); indexed in MEMORY.md.
