---
id: LCLI-298
title: >-
  docker/e2e: lore init's Codex/Claude independent agent detection (LCLI-281)
  has zero E2E coverage
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 04:09'
updated_date: '2026-08-04 06:28'
labels:
  - e2e
  - testing
  - agents
  - init
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies:
  - LCLI-281
references:
  - docker/e2e/run-e2e.sh
  - src/commands/init.ts
  - src/commands/codex-bridge.ts
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
modified_files:
  - docker/e2e/run-e2e.sh
  - docker/e2e/Dockerfile
priority: high
ordinal: 411000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Observed
LCLI-281 (0.1.0's headline "Added" feature) taught `lore init` to detect and configure Claude Code and Codex independently: new `--claude`/`--codex` flags, `--agents` retained as the Claude-only alias, and a first-time Codex setup that generates `.codex/skills/lore/SKILL.md` and surgically maintains a managed block in `AGENTS.md` (preserving unrelated hand-authored prose, per LCLI-281's own AC).

docker/e2e/run-e2e.sh — the CI-required, real-binary gate (LCLI-196) that this project's runbook describes as exercising "the full lore command surface" — has zero coverage of any of this:
- The only `lore init` invocation in the whole harness is bare `lore init` (line ~265), no `--claude`/`--codex`/`--agents`.
- `lore agents` IS exercised extensively (--check/--force, protected-drift, exit 6), but only against a pre-existing Claude Code bridge created by that bare `lore init` — never a first-time Codex bridge, never AGENTS.md managed-block creation/preservation, never `.codex/skills/lore/SKILL.md`.
- The docker/e2e/Dockerfile installs `backlog.md` globally but nothing Codex-related, so even a "Codex not installed" probe path is untested.

Solid coverage exists at the unit level (test/init.test.ts, ~line 470-640: `--claude`, `--codex`, idempotent re-run, hand-authored AGENTS.md prose preservation) — but per this project's own precedent (LCLI-56 found real defects unit tests missed), the real-binary/real-filesystem harness is exactly where this class of behavior (TTY/flag detection, actual file writes under a real cwd, agent-probe interaction) most needs a repeatable gate.

## Why it matters
This is 0.1.0's flagship feature. A regression here (e.g. Codex setup silently clobbering hand-authored AGENTS.md prose, or writing to the wrong path under a real filesystem) could ship undetected since nothing in the required CI gate exercises the real binary against these flags.

## Direction (decide in plan)
Add an E2E phase exercising: `lore init --codex` on a fresh bundle (asserts `.codex/skills/lore/SKILL.md` + `AGENTS.md` created), a second `--codex` run is idempotent, `lore init --claude` still produces the existing Claude bridge, and hand-authored AGENTS.md prose survives a `--codex` re-run with Lore's managed block still refreshed. Re-derive exact assertions from src/commands/init.ts and src/commands/codex-bridge.ts at execution time rather than trusting this description.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore init --codex on a fresh bundle creates .codex/skills/lore/SKILL.md and an AGENTS.md managed block, asserted E2E against the real binary
- [x] #2 A second lore init --codex run is idempotent (no unwanted changes) and lore agents --check reports clean
- [x] #3 lore init --claude still produces the existing Claude Code bridge (.claude/skills/lore/SKILL.md), asserted E2E
- [x] #4 Hand-authored prose in AGENTS.md survives a --codex re-run while Lore's managed block still refreshes
- [x] #5 The full harness runs green against the real pinned binary, and teardown is clean
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the early bootstrap section of docker/e2e/run-e2e.sh with a real-binary `lore init --codex --json` probe after the base bundle is freshly initialized; assert both Codex bridge paths and the AGENTS.md managed markers.
2. Hash the generated Codex bridge files, rerun `lore init --codex --json`, and assert both reported actions and bytes are unchanged.
3. Run `lore init --claude --json`, assert the Claude bridge files were created, and require `lore agents --check --json` to report every file unchanged.
4. Add hand-authored AGENTS.md prose outside the Lore block, corrupt a known line inside the block, rerun `lore init --codex --json`, and assert the prose survives while the managed content is restored; remove only the probe-created bridge artifacts so later phases retain their baseline.
5. Verify shell syntax and diff hygiene, run the full Docker E2E harness against its pinned real binaries with clean teardown, then run proportionate repository gates and an adversarial self-review before finalization.

6. Full Docker verification exposed a pre-entrypoint prerequisite from the already-integrated Ladybug patchedDependencies declaration: copy `patches/` into the image before `bun install --frozen-lockfile`, then rerun the same full harness. This stays within LCLI-298's Docker E2E verification scope.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
First full Docker E2E attempt did not reach the harness: image build failed at `bun install --frozen-lockfile` because package.json declares `patches/@ladybugdb%2Fcore@0.19.0.patch` but docker/e2e/Dockerfile does not copy `patches/` into /opt/lore. Treating the minimal COPY as an in-scope harness prerequisite and rerunning.

Implementation complete and locally verified. Added a real-binary Phase 1b that exercises `lore init --codex` creation/update against Backlog's pre-existing AGENTS.md, byte-stable Codex idempotence, `lore init --claude`, clean `lore agents --check`, managed-block healing with surrounding prose preservation, and exact restoration/removal of probe artifacts.

The first Docker build exposed a pre-entrypoint image defect: package.json's Ladybug `patchedDependencies` file was absent from /opt/lore. Added `COPY patches ./patches` to docker/e2e/Dockerfile. A subsequent structured-report run exposed incorrect assumptions that Backlog had not already created AGENTS.md plus missing shell continuations; corrected both and preserved/restored the Backlog-owned baseline byte-for-byte.

Objective verification: `PUID=501 PGID=20 docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e` passed 316/316 with 0 failures, including every LCLI-298 assertion and teardown; `bun test` exited 0; `bun run typecheck` passed; `bun run lint` checked 186 files with no fixes; `bash -n docker/e2e/run-e2e.sh` passed; `git diff --check` passed.

Adversarial self-review: verified every new mutation runs only inside the guarded disposable container; the probe snapshots and restores Backlog's AGENTS.md bytes, deletes only its exact generated bridge files and now-empty directories, leaves Phase 22's baseline intact, asserts both JSON actions and on-disk bytes, and the full downstream harness remained green. No independent reviewer was authorized.

Delivery limitation: source, Backlog task, and tracker changes remain local and uncommitted. Running the required Lore reconciliation would invoke `lore sync`, whose contract commits all dirty backlog/ state; the active campaign authorization explicitly withholds commit authority. Leave LCLI-298 In Progress until that authority is granted and Lore sync/check can complete.

Local commit authority was granted on 2026-08-04. Source delivery is commit 94cbd23; the earlier delivery-limitation note is superseded. No push, PR, merge, publication, or other remote mutation occurred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered the verified Docker E2E coverage locally in source commit 94cbd23. The new real-binary phase covers independent Codex and Claude initialization, Codex idempotence, clean agent checks, managed AGENTS.md refresh with surrounding prose preservation, and exact teardown. The Docker image now copies the declared patches directory before frozen installation. Verification passed the full Docker harness at 316/316, bun test, typecheck, lint, shell parsing, and diff hygiene.
<!-- SECTION:FINAL_SUMMARY:END -->
