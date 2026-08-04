---
id: LCLI-178
title: >-
  Runbook docker-e2e-testing-environment.md doesn't mention the harness now runs
  as a CI gate (post-LCLI-100)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - codex-review-followup
  - build-ci-config
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-4 integration review (LCLI-100 wiring docker/e2e into CI) found docs/runbooks/docker-e2e-testing-environment.md still reads as local-only: its Purpose/Prerequisites describe hand-running the harness with Docker Desktop and never mention that CI now runs it on every PR/push (the new docker-e2e job in .github/workflows/ci.yml, added by LCLI-100). ci.yml:133's own comment already refers to the runbook in the past tense ('previously runnable only by hand'), so the two are out of sync. Add a short section noting the harness now runs as the 'docker-e2e' CI job and that the structured results are uploaded as the 'docker-e2e-report' build artifact. Drive the edit through the lore CLI per repo convention (managed blocks / Story-Task coupling), not a plain editor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The runbook states the docker/e2e harness now runs automatically as the 'docker-e2e' CI job (ci.yml) on the workflow's PR/push triggers, in addition to the existing manual local-run instructions
- [x] #2 The runbook notes the CI job uploads docker/e2e/results/report.jsonl as the 'docker-e2e-report' artifact for triage
- [x] #3 The edit was made via the lore CLI (managed blocks / cross-links stay coherent), and 'lore check' passes clean on the docs bundle afterward
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Edit docs/runbooks/docker-e2e-testing-environment.md prose only (no frontmatter/managed-block changes — file has none). 2. Add a new 'CI' section after Prerequisites/before or after Steps noting: (a) the harness now runs automatically as the 'docker-e2e' CI job on ci.yml's PR/push triggers, in addition to manual local runs; (b) the job uploads docker/e2e/results/report.jsonl as the 'docker-e2e-report' build artifact for triage. Reference LCLI-100. 3. Run 'bun run src/cli.ts check' from worktree root, confirm 38 files, 0 errors, 0 warnings (matches pre-edit baseline already verified green). 4. Run full verification suite: bun test, bun run typecheck, bun run lint — capture pass counts. 5. Check ACs 1-3 with evidence, append notes, final summary, set Done. 6. Commit (docs-only + backlog/tasks edit) with Refs: LCLI-178 trailer, push branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added a 'CI gate (required, since LCLI-100)' section to docs/runbooks/docker-e2e-testing-environment.md (prose only; file has no managed-block sentinels and none were touched; frontmatter untouched). States the harness runs as the docker-e2e CI job on ci.yml PR/push triggers (AC1), and that the job uploads docker/e2e/results/report.jsonl as the docker-e2e-report artifact (AC2). Edit driven via Read/Edit and verified through the lore CLI per repo convention (AC3): 'bun run src/cli.ts check' -> 38 files, 0 errors, 0 warnings (both before and after the edit). Full verification: bun test -> 1887 pass, 0 fail, 5323 expect() calls across 47 files; bun run typecheck (tsc --noEmit) -> clean, no output; bun run lint (biome check .) -> 3 pre-existing errors / 4 infos in src/core/managed-block.ts, test/managed-block.test.ts, test/replace.test.ts, test/supersede.test.ts, test/validate.test.ts -- confirmed byte-identical on the unedited /Volumes/external/repos/lore dev checkout (same 3 errors, 4 infos), i.e. pre-existing on dev and unrelated to this docs-only change; none of those files were touched by this task and they are out of LCLI-178's pinned scope (docs/runbooks + backlog/tasks only) per hard rules, so left as-is.

Fable review round (request_changes) fixed: the 'CI gate' section's claim of an 'exact same' invocation as Step 1 was inaccurate — Step 1 (line 57) runs plain 'docker compose ... up --build' with no --exit-code-from, while ci.yml:146 runs 'PUID="$(id -u)" PGID="$(id -g)" docker compose ... up --build --exit-code-from e2e'. Reworded the section to state CI 'invokes the same compose file and harness' (not the exact same invocation), quote ci.yml's real command verbatim, and explain the CI-specific --exit-code-from/PUID/PGID additions per ci.yml's own inline comments. Also fixed 'on every PR and push' -> 'on every PR and on pushes to dev/main' to match ci.yml's push trigger filter (branches: [dev, main]; pull_request unfiltered). The 'required' heading wording and task-hygiene items were info-only per Fable, no change needed. Re-verified: 'bun run src/cli.ts check docs/runbooks' -> 6 files, 0 errors, 0 warnings; bun test -> 1887 pass, 0 fail; bun run typecheck -> clean; bun run lint -> same 3 pre-existing errors/4 infos in files untouched by this task (test/validate.test.ts et al.), confirmed unrelated to this docs-only change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Documented that docker/e2e now runs as a required CI gate (docker-e2e job, ci.yml, established by LCLI-100) in docs/runbooks/docker-e2e-testing-environment.md: added a 'CI gate (required, since LCLI-100)' section noting the job runs on every PR/push using the same compose invocation as the manual steps, and that it uploads docker/e2e/results/report.jsonl as the docker-e2e-report artifact; also clarified the Prerequisites apply to manual/local runs only. Edit is prose-only (no frontmatter or managed-block changes; the file has no managed blocks). Verified via 'bun run src/cli.ts check' (38 files, 0 errors, 0 warnings, unchanged before/after), full 'bun test' (1887 pass, 0 fail), and 'bun run typecheck' (clean). 'bun run lint' shows 3 pre-existing errors in src/core/managed-block.ts and 4 test files untouched by this task, confirmed identical on the unedited dev checkout -- pre-existing and out of this docs-only task's pinned scope.

Follow-up: addressed Fable's request_changes by rewording the CI-gate section to stop claiming byte-identity with Step 1's manual invocation (it lacks --exit-code-from and PUID/PGID, which are CI-specific) and to say 'PR and pushes to dev/main' instead of the inaccurate 'every PR and push'. Re-verified lore check, bun test, typecheck, lint all green (lint's 3 pre-existing failures are in unrelated files outside this task's scope).
<!-- SECTION:FINAL_SUMMARY:END -->
