# Handover — LORE-27 (`lore check` drift gate) shipped as PR #37, awaiting review

**Date**: 2026-07-07 | **Grounded against**: `feat/lore-27-check-drift-gate` @ `63d8f79` (branched from `dev` @ `c93ddef`, which has not moved) | **Backlog**: LORE-27 Done; LORE-50 To Do, unblocked

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. LORE-27 (`lore check`'s status-reconciliation +
managed-block drift passes) is implemented and marked Done, delivered via PR #37
(feat/lore-27-check-drift-gate → dev). The PR is OPEN, mergeable, and all 4 CI checks are
green (compile smoke ubuntu; lint/typecheck/test on macos/ubuntu/windows) — it has not been
merged yet; that's the user's call.

If the user says to merge/finalize LORE-27, this repo's "finalize shorthand" applies (see
auto-memory lore-finalize-shorthand.md): squash-merge --admin, prune the branch (local +
remote), ff-push dev→main, and this handover gets archived as consumed. Do not self-merge
without that instruction.

Otherwise, the next open, unblocked, independent Backlog item is LORE-50 (Low priority):
dedupe multi-root `lore check` reconciliation — shared task ids and config validation are
currently re-resolved once per bundle root instead of once for the whole run, when
[paths...] names more than one root. This was deliberately deferred out of LORE-27 after
being flagged (and re-flagged) as correctness-neutral, narrow, and cleanup-grade across
several of LORE-27's own /code-review max rounds — see its Backlog description for the
exact fix shape (gather concepts from every root first, resolve the union of task ids
once, validate config once, while still attributing findings to each root's own label).
```

## State

| Item | Status |
| --- | --- |
| PR #37 (`feat/lore-27-check-drift-gate` → `dev`) | **Open**, mergeable, CI green (4/4 checks) — awaiting user review/merge |
| `dev` / `main` | Both at `c93ddef` (unchanged this session) |
| LORE-27 | Done |
| LORE-50 | To Do, unblocked (dep LORE-27, now Done) |

## Next steps

1. User reviews PR #37; if approved, merge per the finalize shorthand (see prompt above) — not yet done, don't assume it happened.
2. After merge: pick LORE-50, or another Backlog item — no other work is in flight.

## Critical context / traps

- **This task needed 11 rounds of `/code-review max` (vs. LORE-26's 5)** — the full round-by-round trail (what broke, why, the fix) is on LORE-27's Backlog task notes, most-recent-first. Two reusable lessons were extracted into auto-memory (`batch-isolation-review-depth.md`): (1) a batch-processing "isolate failures so one item doesn't discard others' already-computed results" fix has to be reapplied at every nesting grain separately — this task hit it at 4 different grains (cross-root, within-root-per-concept, within-root-per-file-scan twice) before converging; (2) extracting shared logic out of an **already-shipped** command (`reconcile-shared.ts` pulled out of `sync.ts`) needs deeper review than net-new work, since every extraction point risks silently changing the original's exact ordering/precedence.
- **`lore check` can now disagree with `lore sync` in exactly one case, and it's intentional, not a bug**: a concept with malformed frontmatter that ALSO declares `tasks:` fails loud in `check` (matching `sync`'s own unconditional `loadBundle` crash on that file) — verified empirically in round 6 by directly running `lore sync` against the identical fixture. A concept with no bearing on reconciliation (no `tasks:`) still fails tolerant/silent, matching `lore validate`'s Tier-2 job per ADR-0007's validate/check split. This exact tension was re-raised and re-verified across rounds 2, 3, 6, 7, and 9 of the review — don't re-litigate it without re-running that empirical check first.
- **`isDocsRoot` (check.ts) is case-insensitive AND backslash-aware** — a Windows `docs\` or a case-different `Docs` both correctly resolve to the same bundle `lore sync` operates on, so the "run `lore sync`" remediation hint isn't silently omitted on Windows/macOS. Tested directly (not via a real filesystem round-trip) specifically to avoid the case-sensitive-Linux-CI-vs-case-insensitive-mac/win trap this project has hit before (see `external-volume-bun-exdev-traps.md`).

## System of record updated

- **LORE-27** → marked Done; all 11 review rounds recorded via `--append-notes` on the task, most-recent-first, including two rounds (`4`, `10`) where the round's own fix introduced a new instance of the bug it was fixing — both later caught and fixed.
- **LORE-50** → filed this session as the explicit, deliberately-deferred follow-up (multi-root config/task-id dedup), dep LORE-27.
- **CHANGELOG.md**, **docs/reference/cli-surface.md** → updated as part of LORE-27's own PR #37 (already committed; see the PR diff for exact content, not restated here).
- **Auto-memory**: new `batch-isolation-review-depth.md` (the two reusable lessons above), indexed in `MEMORY.md`.
