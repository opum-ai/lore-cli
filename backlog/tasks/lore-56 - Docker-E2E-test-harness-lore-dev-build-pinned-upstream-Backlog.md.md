---
id: LORE-56
title: 'Docker E2E test harness: lore dev build + pinned upstream Backlog.md'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-19 14:50'
updated_date: '2026-07-19 14:50'
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
- [ ] #1 A Dockerfile builds a non-root image containing a compiled lore binary and a compiled backlog binary (pinned upstream commit), both verified at build time via real --version/--help output, on PATH
- [ ] #2 docker compose up --build runs an E2E script exercising every lore command against a real backlog project built via real backlog init/task create/task edit
- [ ] #3 The script produces a structured, fresh-per-run pass/fail report (report.jsonl) and its own exit code reflects overall pass/fail
- [ ] #4 The documented exit-code contract (0/2/3/4/5/6) and the fail-loud capability probe (including a stale-cache case) are each spot-checked with a real repro
- [ ] #5 A new Runbook doc (via lore new Runbook) documents how to run the harness and triage its report, linked from docs/index.md
- [ ] #6 Any genuine lore defects found are filed as new standalone Backlog.md bug tasks with concrete repro steps, referencing this task
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
