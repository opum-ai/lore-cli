---
id: LORE-272
title: >-
  docker/e2e: nothing pins run-e2e.sh's container-only guard — deleting it
  passes bun test, lint, and the docker-e2e CI check
status: To Do
assignee: []
created_date: '2026-07-26 16:47'
labels:
  - build-ci-config
  - docker-e2e
  - test-coverage
dependencies: []
priority: medium
type: bug
ordinal: 374000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
LORE-269's fail-closed container guard in `docker/e2e/run-e2e.sh` should be pinned by a regression test, so it cannot be silently removed.

## Observed
Found by LORE-269's review gate (round 5, wave 2), recorded as a non-blocking follow-up.

The docker-e2e harness **structurally cannot** cover this guard: it only ever executes in the environment where the guard passes. No `bun test` asserts it either. So deleting the guard block would pass `bun test`, `bun run lint`, **and** the required docker-e2e CI check — silently restoring the exact footgun LORE-269 exists to remove (a host invocation that mutates the caller's working directory, which in wave 1 overwrote `backlog/config.yml` and created 3 spurious Backlog tasks).

Note the asymmetry: deleting the `LORE_E2E_CONTAINER=1` `ENV` from `docker/e2e/Dockerfile` is self-pinning in the other direction — the harness would refuse to start and CI would go red loudly. Only the guard block itself is unprotected.

## Why it matters
This repo has direct precedent for statically pinning safety-critical non-TS assets, with the rationale spelled out in `test/release-workflow.test.ts` (approx. lines 1-25): "a future edit that drops the \`if:\` guard … would pass typecheck/lint — this test is the guard for exactly that regression". `test/record-backlog-goldens-guards.test.ts` (approx. line 30) already reads `docker/e2e/Dockerfile` from a test, so reading harness assets from `bun test` is established.

## Direction (decide in plan)
The reviewer's sketch: a ~10-line test that runs `bash docker/e2e/run-e2e.sh` with cwd set to a `mkdtemp` directory and asserts (a) exit 1, (b) the guard message names the correct `docker compose` invocation, and (c) no files were created. This is safe to run **because of** LORE-269's fix. Consider whether asserting the `ENV` line in the Dockerfile is also worth pinning, or whether its fail-loud property makes that redundant.

## Refs
`docker/e2e/run-e2e.sh` (guard approx. lines 42-50), `docker/e2e/Dockerfile` (`LORE_E2E_CONTAINER=1`), `test/release-workflow.test.ts` (precedent), `test/record-backlog-goldens-guards.test.ts` (reads a docker asset from a test), LORE-269 (Done — shipped the guard), LORE-100 (made the harness a CI gate).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A test fails if run-e2e.sh's container-only guard is deleted or neutered, verified by an explicit mutation check recorded in the task notes
- [ ] #2 The test runs the script with cwd set to a temp directory and asserts exit 1, the guard message naming the correct docker compose invocation, and that no files were created in that directory
- [ ] #3 The test does not require Docker and does not run the e2e suite
- [ ] #4 Full suite + lore check stay green; docker compose e2e still reports 302 passed / 0 failed
<!-- AC:END -->
