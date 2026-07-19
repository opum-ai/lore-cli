---
id: LORE-56
title: 'Docker E2E test harness: lore dev build + pinned upstream Backlog.md'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-19 14:50'
updated_date: '2026-07-19 15:21'
labels:
  - testing
  - docker
  - backlog-fork
dependencies: []
references:
  - docs/runbooks/backlog-json-patch.md
  - docs/adr/0002-backlog-integration-json-only.md
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build a hermetic Docker environment that compiles a real lore binary from current dev source and a real backlog binary from upstream MrLesk/Backlog.md pinned at 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 (the --json PR #790 merge commit; ADR-0002's 2026-07-19 amendment says lore won't ship until a tagged Backlog.md release contains it, so this is the only way to test the full toolchain end-to-end today). Run a comprehensive scripted E2E matrix against a real, mutating backlog project (no mocked adapter, per ADR-0002's JSON-only/fail-loud mandate) exercising every lore command, produce a structured pass/fail report, and file any genuine defects as new standalone Backlog.md bug tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Dockerfile builds a non-root image containing a compiled lore binary and a compiled backlog binary (pinned upstream commit), both verified at build time via real --version/--help output, on PATH
- [x] #2 docker compose up --build runs an E2E script exercising every lore command against a real backlog project built via real backlog init/task create/task edit
- [x] #3 The script produces a structured, fresh-per-run pass/fail report (report.jsonl) and its own exit code reflects overall pass/fail
- [x] #4 The documented exit-code contract (0/2/3/4/5/6) and the fail-loud capability probe (including a stale-cache case) are each spot-checked with a real repro
- [x] #5 A new Runbook doc (via lore new Runbook) documents how to run the harness and triage its report, linked from docs/index.md
- [x] #6 Any genuine lore defects found are filed as new standalone Backlog.md bug tasks with concrete repro steps, referencing this task
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. .dockerignore (repo root): exclude node_modules, coverage, .git, dist.
2. docker/e2e/Dockerfile: single stage, base oven/bun:1.2.23 (Debian-based, confirmed), non-root USER.
   - apt-get: git, python3, python3-pip, curl, jq, ca-certificates, Node 22 (NodeSource); pip install "mkdocs>=1.6" "mkdocs-material>=9".
   - Build backlog: clone MrLesk/Backlog.md, checkout 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0, bun install, run the pinned commit's OWN package.json build script (or replicate its exact --define __EMBEDDED_VERSION__/--production/--minify flags) -- a naive `bun build --compile` line drops the version define, backlog --version falls back to a hardcoded "0.0.0", which passes semver parsing but fails lore's MIN_BACKLOG_VERSION floor (1.47.1) as a false-negative capability-probe failure. Assert real, non-0.0.0 version output before proceeding.
   - Build lore: COPY source, bun install --frozen-lockfile --linker=isolated, bun build --compile src/cli.ts --outfile /usr/local/bin/lore. Assert binary size + real --version/--help output (DEVELOPMENT.md EXDEV precedent: never trust exit 0 alone).
   - Put both on PATH, switch to non-root USER, COPY run-e2e.sh, ENTRYPOINT runs it in a scratch workspace.
3. docker/e2e/docker-compose.yml: one service, mounts docker/e2e/results -> /results.
4. docker/e2e/run-e2e.sh: bash+jq, step() helper (name, expected_exit, cmd) appends one JSON line per step to /results/report.jsonl (truncated fresh each run), does not abort the driver on non-critical failure, script exit code = overall pass/fail. Phases (mirrors docs/runbooks/agent-onboarding.md's canonical loop):
   0. preflight (real --version/--help both binaries, assert backlog != 0.0.0), no stale .lore/cache/, negative capability-probe test (hide backlog -> expect exit 6), stale-cache probe-then-break case.
   1. bootstrap: git init + user config, backlog init mirroring this repo's own config.yml (auto_commit:false, check_active_branches:false, remote_operations:false per ADR-0012), lore init.
   2. seed real backlog tasks.
   3. lore new x6 built-in types (Epic/Story/Spec/ADR/Runbook/Reference).
   4. lore link/unlink (verify frontmatter tasks: + backlog doc: label both directions).
   5. lore tasks <story> --json (kind tasks.rollup).
   6. mutate real backlog task status + lore sync --json (kind sync.summary); verify Story status/managed block/index/log + real lore-authored git commit of backlog/.
   7. idempotency: rerun lore sync, assert no-op.
   8. lore validate clean + against a borrowed test/fixtures/okf-bundle/broken/ case.
   9. lore check clean -> inject real drift -> exit 6 -> lore sync heals -> exit 0.
   10. lore orphans clean + genuine orphan case.
   11. lore graph (id/--json/dot). 12. lore query. 13. lore context --max-tokens.
   14. lore replace (managed regions untouched). 15. lore rename (inbound links repointed). 16. lore supersede.
   17. lore schema export (jq-validate each of 6 types' JSON Schema).
   18. lore scaffold mkdocs + real mkdocs build. 19. lore scaffold docusaurus + real npm install && npm run build. 20. lore scaffold obsidian.
   21. lore instructions [+ topic]. 22. lore agents (SKILL.md/CLAUDE.md nudge regenerated). 23. lore help/--json manifest covers all 19 commands.
   24. exit-code spot checks: 2 usage; 3 not_found; 4 denied via chmod 000 on a doc file + lore validate (the ONLY real denied path in src/ is EACCES/EPERM filesystem mapping in errors.ts/new.ts -- NOT a managed-region write, despite agent-onboarding.md's Guardrails wording; flag that doc/code mismatch as a finding if confirmed); 5 conflict (duplicate lore new); 6 validation case (malformed frontmatter) alongside phase 9's drift case; --plain auto-selection off-TTY + explicit --plain.
   25. tally + exit code.
5. Build image, run it, read docker/e2e/results/report.jsonl. Triage every FAIL against real source before filing anything -- distinguish harness mistakes from genuine lore defects. File only confirmed genuine defects via backlog task create --type bug, standalone (not subtasks), with concrete repro, referencing LORE-56.
6. Author docs/runbooks/e2e-docker-testing.md via `lore new Runbook`, link from docs/index.md Runbooks section, verify `lore check` stays 0 errors/warnings.
7. Record final tally + filed bug task IDs in this task's notes; finalize per backlog instructions task-finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built docker/e2e/{Dockerfile,docker-compose.yml,run-e2e.sh}: single-stage image on oven/bun:1.2.23 (confirmed Debian-based), non-root (reuses the base image's existing uid-1000 `bun` user -- required for the real exit-4/EACCES repro, since root ignores Unix permission bits). Compiles a real `backlog` binary from MrLesk/Backlog.md pinned at 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0 via upstream's OWN `bun run build` script (not a hand-rolled compile line -- verified upstream's scripts/build.ts embeds the real package.json version via --define __EMBEDDED_VERSION__; a naive compile line would silently produce a "0.0.0"-version binary that passes semver parsing but fails lore's MIN_BACKLOG_VERSION floor, misreporting a build defect as a lore bug). Compiles a real `lore` binary from current dev source the same way ci.yml does. Both binaries verified at build time via real --version/--help output (size + content, never trust exit 0 alone), mirroring ci.yml's own compile-smoke paranoia.

run-e2e.sh drives 81 real steps against a real, mutating scratch backlog project (git init + backlog init configured to mirror this repo's own ADR-0012 contract -- auto_commit/checkActiveBranches/remoteOperations all false -- + lore init), covering all 19 lore commands, the documented canonical loop (new -> link -> sync -> check), idempotency, the full exit-code contract (0/2/3/4/5/6), the fail-loud capability probe (missing-binary case), and real downstream builds for both scaffold targets that need them (mkdocs build, docusaurus npm install && npm run build).

First run: 69/81 passed. All 12 initial failures were triaged individually (each verified via a live debug shell against the real pinned binary before being written off) and turned out to be harness bugs, not lore bugs -- e.g. `lore sync`/`lore tasks` take a concept id, not a .md file path; `lore check`'s positional args must be bundle directories, not individual files; `lore tasks` on a concept with zero linked tasks never shells out to backlog at all (so a "hide backlog from PATH" test needs a concept with real linked tasks or it silently no-ops); `lore orphans`' documented scope explicitly exempts any doc: label (even one pointing nowhere) from being flagged, so testing it needs a task with NO doc: label at all; case-sensitivity (backlog CLI output is uppercase, frontmatter storage is lowercase); and a git-status idempotency check needs scoping to backlog/ specifically, since lore deliberately never commits docs/.lore/AGENTS.md itself. Fixed all 12 and re-ran to a clean 81/81 pass, confirmed via `docker inspect --format '{{.State.ExitCode}}'` = 0 and `jq -r .status report.jsonl | sort | uniq -c` = 81 PASS.

Four GENUINE defects were confirmed this way (not mocked-adapter-invisible, all reproduced against the real pinned upstream binary) and filed as standalone bug tasks referencing this task:
- LORE-57: editTask() (src/adapters/backlog.ts) sends --json to `backlog task edit`, which doesn't support it (only task list/view/search do, per PR #790's actual scope) -- breaks every lore link/unlink/rename back-ref write, exit 1 from backlog swallowed into a generic "exited 1".
- LORE-58: lore link/unlink --json emits a full success-shaped envelope on stdout even when exiting nonzero (6), violating the documented "stdout parses or stays silent" contract (agent-onboarding.md 3.2) -- a structural gap independent of LORE-57's root cause.
- LORE-59: lore new Story's built-in template has no <!-- lore:tasks:begin/end --> markers, so lore sync fails once real tasks are linked to a fresh Story -- breaks the documented canonical loop (new -> link -> sync) out of the box. (The harness works around this after reproducing it once, so downstream phases can still exercise sync/check/idempotency for real.)
- LORE-60 (low, doc-accuracy): ADR-0002 says a missing/too-old/incapable backlog binary all map to exit 6; the real, deliberately-designed code (probeBacklog's own comment) splits "missing entirely" into exit 3 (not_found) -- the code is fine, the ADR's summary sentence overclaims.

Two of run-e2e.sh's steps deliberately assert these CURRENT buggy exit codes (not the desired ones) as a standing regression baseline -- see the script's inline comments for exactly which, and the note that whoever fixes LORE-57/58/59 must flip the corresponding step's expected exit code in the same change, or a passing run would silently mask the regression fix never landing.

Authored docs/runbooks/docker-e2e-testing-environment.md via `lore new Runbook` (not hand-written), linked from docs/index.md's Runbooks section. Verified: `lore validate` on the new doc (0 errors), `lore check` across the whole bundle (38 files, 0 errors, 0 warnings), `bun run typecheck` clean, `bun run lint` clean (same 4 pre-existing infos LORE-53/54 already noted as unrelated -- confirmed via git diff these predate this change, no src/ files were touched by this task at all).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built docker/e2e/ (Dockerfile + docker-compose.yml + run-e2e.sh): a hermetic Docker environment that compiles a real lore binary from current dev source and a real backlog binary from upstream MrLesk/Backlog.md pinned at the --json PR #790 merge commit, then runs 81 real steps against a real, mutating backlog project covering all 19 lore commands, the full documented exit-code contract, the fail-loud capability probe, and both scaffold targets' real downstream builds. No mocked adapter anywhere. Iterated from an initial 69/81 pass to a clean 81/81 by triaging and fixing 12 harness assumption bugs (verified each individually against the live binary before dismissing). Along the way confirmed 4 genuine lore defects invisible to the mocked-adapter test suite, filed as standalone tasks: LORE-57 (editTask sends --json to a Backlog write command that doesn't support it, breaking link/unlink/rename back-ref writes), LORE-58 (link/unlink violates the stdout/stderr exit-code contract on partial failure), LORE-59 (lore new Story omits the managed-block markers, breaking the documented new-link-sync loop on a fresh Story), LORE-60 (ADR-0002 overstates the missing-binary exit code as 6; real code deliberately uses 3). Documented the harness in a new lore-authored Runbook (docs/runbooks/docker-e2e-testing-environment.md), linked from docs/index.md. Verified: docker compose up --build exits 0 with 81/81 PASS in report.jsonl, lore check clean (38 files/0 errors/0 warnings), lore validate clean on the new doc, bun run typecheck/lint clean (same 4 pre-existing lint infos as before, unrelated).
<!-- SECTION:FINAL_SUMMARY:END -->
