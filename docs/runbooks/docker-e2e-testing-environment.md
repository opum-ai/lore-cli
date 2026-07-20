---
type: Runbook
title: Docker E2E testing environment
description: How to run the Docker-based E2E harness that builds a real compiled lore binary and a real compiled backlog binary (pinned upstream commit) and exercises the full lore command surface against them, plus how to triage its report.
tags: [docker, e2e, testing, backlog-fork]
summary: Build and run docker/e2e's hermetic test environment, which compiles real lore and backlog binaries and drives every lore command against a real, mutating backlog project.
timestamp: 2026-07-19T15:19:02.387Z
---

# Docker E2E testing environment

## Purpose

lore has not shipped a release yet: per [ADR-0002](../adr/0002-backlog-integration-json-only.md)'s
2026-07-19 amendment, there is no tagged `MrLesk/Backlog.md` release containing PR #790 (the
`--json` support lore depends on), so lore's unit/integration test suite mocks the `BacklogAdapter`
entirely. That mock can never catch a mismatch between what lore's adapter *assumes* Backlog's CLI
accepts and what a real, pinned-commit `backlog` binary actually accepts — exactly the class of bug
`docker/e2e/` exists to catch.

The harness (`docker/e2e/Dockerfile`, `docker-compose.yml`, `run-e2e.sh`) builds two **real**
binaries — a compiled `lore` from this repo's current dev source, and a compiled `backlog` from
upstream `MrLesk/Backlog.md` pinned at the PR #790 merge commit
(`22a091b570d44c4f302ca47e7fd36fa28ad8bcb0`, per the
[backlog-json-patch runbook](backlog-json-patch.md) §8.1) — and runs every `lore` command against a
real, mutating scratch backlog project built through real `backlog init`/`task create`/`task edit`
calls. No mocking anywhere, matching [ADR-0002](../adr/0002-backlog-integration-json-only.md)'s
JSON-only, fail-loud design. LORE-56 first ran this and found four real defects
(LORE-57/58/59/60) that 1497 passing mocked-adapter tests had missed entirely.

## Prerequisites

- Docker Desktop (or another Docker Engine) running locally.
- Network access during the image build (clones `MrLesk/Backlog.md`, `apt-get`/`pip`/`npm` installs).
- Run from the repo root — the compose file's build context is `../..` relative to `docker/e2e/`.

## Steps

1. Build and run:

   ```sh
   docker compose -f docker/e2e/docker-compose.yml up --build
   ```

   The build stage fails loud (non-zero exit) if either binary doesn't compile to real, working
   output — see the Dockerfile's inline comments for why a naive `bun build --compile` line for
   `backlog` is wrong (it silently embeds a fallback `0.0.0` version that then fails lore's own
   version-floor check).

2. Watch the container's stdout: one `[PASS]`/`[FAIL]` line per step, ending in a tally
   (`==== E2E summary: N passed, M failed ====`). The container's own exit code mirrors the tally
   (`0` only if every step passed).

3. Read the structured report at `docker/e2e/results/report.jsonl` (one JSON object per line —
   `name`, `status`, `expected_exit`, `actual_exit`, `stdout`, `stderr`) — generated fresh each run,
   never appended across runs.

4. **Triage every `FAIL` before treating it as a real defect.** Most first-draft failures in a
   harness like this turn out to be wrong assumptions in the *script*, not lore bugs — see
   `run-e2e.sh`'s inline comments for several already-diagnosed examples (e.g. `lore check`'s
   positional arguments must be directories, not files; `lore sync` takes a concept id, not a `.md`
   path; `lore tasks` on a concept with no linked tasks never shells out to `backlog` at all, so
   hiding the binary from `PATH` silently no-ops that specific test). Re-read the relevant `lore`
   source before concluding a `FAIL` is genuine.
5. For each confirmed genuine defect, file a new standalone Backlog task
   (`backlog task create --labels bug ...`) with the exact repro command, expected vs. actual
   behavior/exit code, and a reference back to the harness task — never a subtask of the harness
   task itself, since each defect typically belongs to an independent lore subsystem.

## Known, already-filed regressions baked into the script

One finding from the same LORE-56 run is tracked but doesn't have a dedicated `run-e2e.sh`
regression step (nothing in the script's own exit-code assertions currently encodes it):

- **LORE-58** — `lore link`/`unlink --json` would emit a full success-shaped envelope on stdout
  even on a nonzero exit, if any per-task write fails. LORE-57 (below) removed the only trigger
  path currently exercised by this script, but the structural gap in `link.ts` remains — any
  future per-task write failure would still reproduce it.

**LORE-57 (fixed)** — `lore link`/`unlink`'s Backlog `doc:` back-ref write used to fail
(`editTask` sent `--json` to `backlog task edit`, which doesn't support it) and exit `6`; the
frontmatter `tasks:` list was still written correctly. Phase 4's steps now assert the fixed
behavior (exit `0`, real `backRef` add/remove) instead of the regression baseline.

**LORE-60 (fixed)** — a fully missing `backlog` binary is `not_found`/exit `3`, distinct from a
present-but-too-old-or-non-`--json`-capable binary (`validation`/exit `6`); the code's own inline
comment explains the split is deliberate. [ADR-0002](../adr/0002-backlog-integration-json-only.md)
previously collapsed both cases into a single "exit `6`" claim — a doc-accuracy gap, not a code
bug — now corrected to match the real exit codes.

When any of the remaining findings are fixed, flip the corresponding `step`'s expected exit code
(and delete the now-unneeded workaround) in the same change that fixes the underlying bug — a
passing run with the old expectation still in place would silently mask a regression.

## Known not-coverable in this harness

A few command-surface behaviors cannot be exercised here at all — documented so a future audit
does not treat their absence as a gap to fill:

- **Exit-1 uncaught faults** — `EXIT_UNCAUGHT` (`cli.ts`'s last-ditch backstop) fires only when
  `reportError` itself throws; there is no supported way to induce that from outside the process.
- **Live Obsidian consumer verification** — Obsidian has no headless mode this harness can drive.
  `lore scaffold obsidian`'s unit tests already pin the exact `app.json`/plugin config values; the
  documented path for a real render/link/backlink check is the `obsidian` CLI against a running
  Obsidian.app instance, outside this container.
- **True TTY pretty-mode rendering** — the container's stdout is always piped, so `--plain`
  auto-selection is what this harness can prove; genuine ANSI/color output only renders at a real
  TTY (partially closable via `script(1)` if ever worth the added complexity).

## Rollback

The harness is entirely self-contained: `docker compose -f docker/e2e/docker-compose.yml down` (or
simply letting the container exit) leaves the host repo untouched — the scratch backlog/lore project
lives only inside the container's own filesystem and is discarded with it. Nothing outside
`docker/e2e/results/report.jsonl` persists on the host.
