---
id: LORE-269
title: >-
  docker/e2e/run-e2e.sh runs its destructive phases against the caller's cwd
  when invoked outside the container (no set -e, unguarded cd /workspace)
status: To Do
assignee: []
created_date: '2026-07-26 12:46'
labels:
  - build-ci-config
  - dx
  - docker-e2e
dependencies: []
priority: high
type: bug
ordinal: 371000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
`docker/e2e/run-e2e.sh` should fail closed when it is not running inside its container, instead of silently continuing and mutating the caller's working directory.

## Observed
Hit for real during round 5, wave 1 (LORE-267). A worker ran `bash docker/e2e/run-e2e.sh` directly on the host instead of through `docker compose`. The script:

- declares `set -uo pipefail` at **line 17** — deliberately **without `-e`** (line 34's own comment confirms the omission is intentional, so the harness can keep running after an individual assertion fails), and
- runs an **unguarded `cd /workspace`** at **line 163** (the only occurrence).

On a host `/workspace` does not exist, so the `cd` fails, the script does not stop, and every later phase executes against the caller's cwd. Concretely it:
- overwrote `backlog/config.yml`'s `project_name` (`lore` -> `lore-e2e`), stripping the ADR-0012 header comment,
- created **3 spurious real Backlog tasks** (LORE-269/270/271) in `backlog/tasks/`,
- wrote stray `.lore/.gitignore`, `.lore/profile.toml`, `.lore/schemas/`, `.lore/templates/`, and `AGENTS.md` into the worktree.

All of it was uncommitted working-tree state and was fully reverted — nothing was staged, committed, or pushed, and the orchestrator independently verified the cleanup (no LORE-269/270/271 anywhere, `backlog/config.yml` untouched on the branch, the committed diff exactly the 5 expected files). But the next person may not notice before committing.

## Why it matters
The correct invocation (`docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e`) is documented, but the script is executable and sitting right there, and its failure mode is **silent and destructive** rather than a clean error. It creates real Backlog tasks, which mints IDs and is exactly the shared-state mutation the campaign otherwise serializes carefully. Note `set -e` cannot simply be added — the harness relies on continuing past failed assertions — so the guard has to be local to the `cd`.

## Direction (decide in plan)
Fail closed at the `cd`, e.g. `cd /workspace || { echo "run-e2e.sh must run inside the e2e container; use docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e" >&2; exit 1; }`. Consider additionally asserting a container-only marker (e.g. `/.dockerenv`, or an env var set by the compose service) **before** any mutating phase, so the script refuses early rather than at the first `cd`. Check whether any other `cd` or path assumption in the script has the same shape.

## Refs
`docker/e2e/run-e2e.sh` (line 17 `set -uo pipefail`, line 34 comment, line 163 `cd /workspace`), `docker/e2e/docker-compose.yml` (service `e2e`), `docs/runbooks/docker-e2e-testing-environment.md`, LORE-100 (made the harness a CI gate), LORE-104 (exit-code propagation).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running run-e2e.sh outside its container exits non-zero with a clear message naming the correct docker compose invocation, before any phase that writes to the filesystem or invokes backlog
- [ ] #2 The guard does not rely on 'set -e' (the harness intentionally omits it so it can continue past failed assertions) — verify the omission is preserved and the harness still reports all failing assertions rather than stopping at the first
- [ ] #3 Any other unguarded cd or container-path assumption in the script is identified and either guarded or explicitly documented as safe
- [ ] #4 The in-container path is unaffected: docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e still reports 302 passed / 0 failed and exit 0
- [ ] #5 A host-side invocation is verified by hand to leave the working tree clean (git status --porcelain empty, no new backlog/tasks/ files, backlog/config.yml unmodified)
<!-- AC:END -->
