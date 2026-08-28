---
id: LCLI-358.1
title: >-
  Run the lore init preflight before any write, and make git required with an
  escape hatch
status: Done
assignee:
  - '@claude'
created_date: '2026-08-28 21:46'
updated_date: '2026-08-28 22:17'
labels:
  - init
  - git
  - dx
dependencies: []
parent_task_id: LCLI-358
ordinal: 480000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today src/commands/init.ts writes the whole base scaffold (docs/, .lore/) before the wizard asks its first question, so a Ctrl-D or a declined prompt leaves a half-applied bundle. Move every check ahead of the first byte written.

Git is effectively required: `lore sync` fails without it (`git rev-parse HEAD exited 128: not a git repository`, confirmed 2026-08-28) and `quest init` refuses a non-git path. `lore check` still works, so a docs-only bundle stays legitimate — hence an escape hatch rather than a wall.

docker/e2e/run-e2e.sh:269 already runs `git init` first, so e2e is unaffected; three unit tests in test/init.test.ts use bare temp dirs and need the flag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A non-git directory prompts to run `git init`; accepting initializes the repository and continues
- [x] #2 Declining exits non-zero with a diagnostic naming lore sync's git dependency, and leaves the directory byte-for-byte unchanged
- [x] #3 `--allow-no-git` skips the requirement for a docs-only bundle, in both the wizard and the non-interactive path
- [x] #4 An interrupted wizard (EOF/Ctrl-D) leaves no partially written bundle
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a synchronous git preflight seam (src/adapters/git-preflight.ts): isRepository() via `git rev-parse --is-inside-work-tree` (walks up, so a bundle nested below the repo root counts) and initialize() via `git init`. Sync on purpose — runInit's contract keeps the common non-interactive path a plain number, and only the wizard returns a Promise. Injectable as InitOptions.git.
2. Add --allow-no-git to InitArgs. Deliberately NOT part of anyFlagGiven: every other init flag answers a consumer question and therefore stands in for the wizard, but this one answers a preflight gate. Including it would make `lore init --allow-no-git` skip the wizard entirely and leave no way to reach the wizard in a non-git directory. Document the deviation in ADR-0017.
3. Reorder runInit so nothing is written before the preflight: parse args -> resolve interactivity -> validate flag combinations -> git preflight -> (interactive) wizard prompts -> buildScaffold + write -> tracker persistence, bridges, scaffolds, probe, emit. Extract the scaffold write into its own function so both paths call it at the new point.
4. Git preflight behavior: a repository continues; --allow-no-git continues with a warning; interactive prompts 'Initialize a git repository here?' (default yes) and runs git init on yes; a declined prompt or a non-interactive run without the flag throws a validation LoreError (exit 6) naming lore sync's git dependency and the flag.
5. Hoist prompter construction into runInit so the git question and the wizard share one readline session, keeping the existing EOF/close handling.
6. Tests: test/init.test.ts helper injects a stub git seam by default; new tests cover accept, decline, --allow-no-git, non-interactive refusal, EOF-leaves-nothing, and the real detector against a real git init. The four other files that call runInit as a scaffolding helper (graph, new, schema-export, validate) call helpers.gitRun(root, ['init']) first.
7. Run typecheck, lint, and the full suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification (2026-08-28).

Unit: bun test 2685 pass / 0 fail / 1 skip across 90 files. 12 new tests in test/init.test.ts cover accept-git, decline-git, --allow-no-git in both paths, --allow-no-git NOT skipping the wizard, an already-initialized repository never prompting, EOF-leaves-nothing, a rejected flag combination leaving nothing, and the real realGitPreflight against a real repository (including detection from a subdirectory). bun run lint and bun run typecheck both exit 0; lore check exits 0 (75 files, 0 errors).

Live (real CLI, not stubs):
- AC#1: driven through a real pty with expect(1). The wizard asked the git question first, ran git init (.git present, git rev-parse --is-inside-work-tree = true), then continued through tracker/agents/scaffold and wrote the bundle.
- AC#2/AC#4: non-git dir, lore init --json -> exit 6, stderr envelope {"error_type":"validation","message":"`lore init` needs a git repository: this directory is not a git worktree"}, working directory left empty. Piped-pty EOF likewise left the directory empty.
- AC#3: lore init --allow-no-git --json -> kind init.result with docs/index.md created, outside a worktree.

Decisions.
1. --allow-no-git is excluded from anyFlagGiven, the single documented exception to ADR-0017's any-flag rule. Every other init flag answers a wizard question; this one waives a preflight gate. Including it would make `lore init --allow-no-git` scaffold-and-exit, leaving no way to reach the wizard from a non-git directory. Recorded as an ADR-0017 amendment and asserted by a test.
2. resolveTrackerSelection is now resolved lazily. Eager resolution reads .lore/config.toml, which on a root where .lore is a regular file replaced the scaffold's precise conflict diagnostic with a config-read failure. Each guard tests its cheap flag half first, so a bare run never resolves it.
3. Fixed a diagnostic regression the reordering exposed: when stdin has ALREADY hit EOF, rl.question() rejects synchronously with Node's internal 'readline was closed', which won the race against closedEarly and surfaced instead of the classified usage error. Previously masked because the scaffold ran first and gave closedEarly a head start. ask() now decides the already-closed case explicitly and translates Node's rejection; covered by a new test and confirmed live under a pty.

Test-harness blast radius: test/init.test.ts injects a recording GitPreflight stub (defaults to 'already a repository'); test/cli.test.ts drives the real router and has no seam, so its three affected beforeEach blocks now gitRun(cwd, ['init']); graph/new/schema-export/validate call runInit purely to scaffold and pass --allow-no-git.

Not verified here: the docker e2e suite. Two cases were added to docker/e2e/run-e2e.sh (refusal outside a worktree with a wrote-nothing assertion, and --allow-no-git scaffolding), bash -n passes, and both assertions were reproduced against the real CLI locally — but the container could not run, as docker info exits 1 on this host.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
lore init now runs its whole preflight before writing a byte, and requires a git worktree with --allow-no-git as the escape hatch.

New src/adapters/git-preflight.ts adds a synchronous GitPreflight seam (git rev-parse --is-inside-work-tree, git init), sync so runInit's non-interactive path stays a plain number rather than a Promise. runInit reordered: parse -> validate flag combinations -> git preflight -> (interactive) all prompts -> applyBaseScaffold -> persistence/bridges/scaffolds/probe. The scaffold write moved into applyBaseScaffold so a declined git prompt, a rejected flag combination, or a Ctrl-D leaves the directory byte-for-byte unchanged. The wizard's first question offers git init; off a TTY a missing repository is a validation error (exit 6) naming lore sync's dependency and the flag.

--allow-no-git is excluded from anyFlagGiven, the single documented exception to ADR-0017's any-flag rule, so a non-git directory can still reach the wizard. Amended ADR-0017 and docs/reference/cli-surface.md; registered the flag in the CLI manifest.

Verified: bun test 2685 pass / 0 fail; lint, typecheck, and lore check all exit 0; the accept-git wizard path driven end to end through a real pty with expect(1); the refusal and --allow-no-git paths reproduced against the real CLI. Two docker/e2e cases added and bash -n clean, but the container suite could not run on this host (docker info exits 1).
<!-- SECTION:FINAL_SUMMARY:END -->
