# Handover — fix the 4 real defects the Docker E2E harness found (LCLI-57, LCLI-58, LCLI-59, LCLI-60)

**Date**: 2026-07-19 | **Grounded against**: dev/main @ `9650cd44bdb8a1b2e2c0e43da30bcde8cd91e1bc` (PR #52, merged, CI green on both branches) | **Backlog**: LCLI-56 (Done), LCLI-57, LCLI-58, LCLI-59, LCLI-60 (all To Do)

## Paste-ready prompt for the next session

```
Pick up LCLI-57 (highest-impact first — it breaks lore link/unlink/rename's Backlog
back-ref write for real, against the pinned upstream binary). Read backlog task view
LCLI-57 --plain for the full repro and acceptance criteria, follow this project's
normal backlog instructions task-execution workflow (plan, record it on the task,
implement, verify against a REAL pinned-upstream backlog binary — not just the mocked
adapter tests — then backlog instructions task-finalization).

After LCLI-57 lands, LCLI-58 (link/unlink's stdout/stderr contract violation on
partial failure) becomes easier to verify cleanly, since LCLI-57's fix removes the
main trigger path — but LCLI-58 is a distinct, still-real structural gap (any future
per-task write failure would reproduce it) and needs its own design decision (see its
AC1: pick exit-0-with-partial-failure-in-data vs. nonzero-exit-with-ErrorEnvelope).

LCLI-59 (Story template missing the lore:tasks managed-block markers) and LCLI-60
(low-priority ADR-0002 doc-accuracy fix) are independent of LCLI-57/58 and can be
done in any order, including in parallel across sessions.

For EVERY one of these four: after fixing, update docker/e2e/run-e2e.sh — each fix
has a step whose expected exit code currently asserts the CURRENT BUGGY behavior on
purpose (search run-e2e.sh for "LCLI-57", "LCLI-58", "LCLI-59", "LCLI-60" — the
comments say exactly which step and why). Flip that step's expected exit code (and
delete the LCLI-59 workaround block once the template ships the markers itself), then
re-run `docker compose -f docker/e2e/docker-compose.yml up --build` and confirm it's
still 100% green with the corrected expectations — a passing run with the OLD
expectation still in place would silently mask the fix never actually landing.
```

## State

| Item | Status |
| --- | --- |
| PR #52 (LCLI-56: Docker E2E harness) | Merged to `dev` (squash `9650cd4`), `dev` ff-merged into `main`, both pushed, CI green on both, feature branch pruned locally + remotely |
| LCLI-56 | Done — all 6 ACs checked with evidence (see task notes/final summary) |
| LCLI-57 | To Do — `editTask()` (`src/adapters/backlog.ts`) sends `--json` to `backlog task edit`, which doesn't support it (only `task list`/`view`/`search` do). Breaks every `lore link`/`unlink`/`rename` back-ref write against a real backlog binary. Concrete repro on the task. |
| LCLI-58 | To Do, depends on LCLI-56 + LCLI-57 (informational dep, not a hard blocker — see task) — `lore link`/`unlink --json` emits a full success-shaped envelope on stdout even when exiting nonzero (6), violating the documented stdout/stderr contract |
| LCLI-59 | To Do — `lore new Story`'s built-in template has no `<!-- lore:tasks:begin/end -->` markers; `lore sync` fails once real tasks are linked to a fresh Story. Breaks the documented canonical `new → link → sync` loop out of the box |
| LCLI-60 | To Do, Low priority — `docs/adr/0002-backlog-integration-json-only.md` Decision point 5 says missing/too-old/incapable backlog all map to exit 6; real code deliberately uses exit 3 for "missing entirely" (see `probeBacklog`'s own inline comment). Doc-only fix. |
| `docker/e2e/` harness | Working, 81/81 green as of the merge commit. Two of its steps intentionally assert LCLI-57/58's and LCLI-59's *current buggy* exit codes as a regression baseline — see "Critical context" below |

## Next steps

1. `backlog task view LCLI-57 --plain` — read the full repro and ACs, then follow the
   normal plan → implement → verify → finalize loop (`backlog instructions
   task-execution` / `task-finalization`).
2. Fix is likely a one-line removal (`"--json"` out of `editTask`'s args array in
   `src/adapters/backlog.ts`), but LCLI-57's AC4 asks for a regression test asserting
   `editTask` never emits `--json` in its argv — write that against the existing
   fake-spawn harness (`test/backlog-adapter.test.ts` and friends), and also re-verify
   against a **real** pinned-upstream `backlog` binary per LCLI-57's AC2/AC3 (mirror
   how LCLI-53/54 did their real-binary verification — see those tasks' implementation
   notes for the clone/checkout/`bun install`/`bun run build` sequence, or just reuse
   `docker/e2e/`).
3. LCLI-58 needs a design decision before implementation (its AC1) — likely worth a
   quick check-in on which of the two options the user prefers before writing code.
4. LCLI-59: decide between adding the markers to `STORY_TEMPLATE`
   (`src/core/template.ts`) or having `managed-block.ts`/`sync.ts` create the block on
   first sync when totally absent — the task's AC1 leaves this open deliberately.
5. LCLI-60 is docs-only: correct ADR-0002 §Decision point 5, and check
   `docs/reference/backlog-cli-contract.md` / `docs/runbooks/agent-onboarding.md` for
   the same overclaim (not yet checked — flagged as AC2 on the task, not verified this
   session).
6. After each fix, update the matching `run-e2e.sh` step(s) as described in the
   paste-ready prompt above, and re-run the full Docker suite to confirm still green.

## Critical context / traps

- **The mocked-adapter unit test suite (1497+ tests, all green) did not and cannot
  catch any of LCLI-57/58/59/60** — they're all real-binary-only findings. Don't treat
  a green `bun test` as proof a fix for these actually works; re-verify against a real
  pinned-upstream `backlog` binary (easiest via `docker/e2e/`, or manually per
  LCLI-53/54's documented real-binary verification technique).
- `run-e2e.sh` currently has explanatory comments at the exact lines that encode
  LCLI-57/58/59/60's current-buggy expectations — grep the script for the LORE-NN
  numbers before touching it, so a fix's corresponding step gets flipped in the same
  change, not forgotten.
- **`gh pr merge --admin --delete-branch` checks the local checkout back to the base
  branch before deleting the feature branch.** If local `dev` hasn't yet been updated
  to the new squash commit at that moment, this makes newly-added files briefly
  disappear from the working tree (they're still 100% safe on `origin/dev` — just
  `git reset --hard origin/dev` afterward). Encountered and safely resolved this
  session; don't panic if it recurs, but do verify with `git diff <old-local-head>
  origin/dev -- <paths>` before resetting, same as this session did.
- Building the pinned-upstream `backlog` binary: use upstream's own `bun run build`
  (`bun scripts/build.ts`), never a hand-rolled `bun build --compile` line — the real
  script embeds the version via `--define __EMBEDDED_VERSION__`, and skipping that
  makes `backlog --version` report a bogus `"0.0.0"` fallback that then fails lore's
  own `MIN_BACKLOG_VERSION` floor check. Full reasoning in `docker/e2e/Dockerfile`'s
  comments.

## Do not repeat

- Don't invoke the interpreted CLI via `bun run --cwd <path> src/cli.ts` from a
  different working directory expecting it to operate on that other directory — `bun
  run --cwd X` changes the **process** cwd to `X` before running, so `lore` ends up
  operating on the repo at `X`, not wherever you `cd`'d to. Use a shell function
  (`lore() { bun /path/to/src/cli.ts "$@"; }`) or `cd` into the target dir and run
  `bun /absolute/path/to/src/cli.ts` instead. This caused a real accidental write to
  this repo's own `docs/`/`backlog/`/`.lore/` mid-session (cleanly reverted, no lasting
  damage, but wasted a round trip).
- Don't assume `lore sync`/`lore tasks`/`lore link` accept a `.md` file path — they
  take a **concept id** (`stories/foo`, no `docs/` prefix, no extension) or no
  args for the whole bundle.
- Don't assume `lore check`'s positional args accept individual file paths — they must
  be **bundle directories** (or omitted for the whole bundle); `lore validate` is the
  one that takes file paths.
- Don't test `lore tasks`'s Backlog-capability-probe failure mode against a concept
  with an **empty** `tasks:` list — it returns an empty rollup without ever shelling
  out to `backlog` at all, so hiding the binary from `PATH` silently no-ops the test.
  Use a concept with real linked tasks.
- Don't assume `lore orphans` flags a task whose `doc:` label points at a nonexistent
  concept — per its own documented scope, **any** `doc:` label (valid or not) exempts
  a task from `orphanTasks`; that mismatch is `lore check`'s job. A genuine orphan
  needs a task with **no** `doc:` label and no owning `tasks:` reference at all.

## System of record updated

- LCLI-56: plan, extensive implementation notes (harness design, all 12 harness-bug
  triage findings, all 4 real defects found), final summary, all 6 ACs checked,
  status Done.
- LCLI-57, LCLI-58, LCLI-59, LCLI-60: created with full repro, acceptance criteria,
  and cross-references back to LCLI-56.
- `docs/runbooks/docker-e2e-testing-environment.md` (new, via `lore new Runbook`):
  how to run the harness and triage its report, including the known-regression list.
- `docs/index.md`: linked the new runbook.
- `CHANGELOG.md`: **not updated this session** — worth checking whether this repo's
  convention wants an `[Unreleased]` entry for the new Docker harness before the next
  release-adjacent work.
