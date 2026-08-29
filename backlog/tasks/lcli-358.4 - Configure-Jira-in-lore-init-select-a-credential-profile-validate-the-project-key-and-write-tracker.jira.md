---
id: LCLI-358.4
title: >-
  Configure Jira in lore init: select a credential profile, validate the project
  key, and write [tracker.jira]
status: Done
assignee:
  - '@claude'
created_date: '2026-08-28 21:47'
updated_date: '2026-08-29 00:23'
labels:
  - init
  - tracker
  - jira
dependencies: []
parent_task_id: LCLI-358
ordinal: 483000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Selecting jira today produces a bundle that breaks on first use: `lore init` never writes `[tracker.jira]`, so createTrackerAdapter (src/adapters/tracker.ts) throws `tracker.jira configuration is required when the tracker backend is jira`.

jira-cli owns credentials; Lore must never collect or store them. It emits machine-readable output by default — confirmed 2026-08-28 with jira-cli 1.0.2:

    $ jira config list-profiles
    {"success":true,"data":{"profiles":[{"name":"salient","jiraUrl":"https://...","isDefault":true}]}}

So the flow is: require at least one profile (zero profiles is the escape hatch — exit with `jira init`, which is interactive and credential-bearing, so Lore never runs it); ask the user to confirm which profile, defaulting to the isDefault one; ask for the Jira project key; validate it with `jira project get <KEY> --profile <name>`; report the failure plainly if it does not resolve.

The non-secret keys Lore persists are defined by JiraTrackerConfig in src/config.ts: profile, project, board, issue_type, default_labels, status_flow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Zero jira-cli profiles exits with the `jira init` command and no partial configuration written
- [x] #2 One or more profiles are listed for the user to confirm, defaulting to jira-cli's default profile
- [x] #3 The entered project key is validated live against the chosen profile, and a failure is reported with jira-cli's own reason rather than a generic error
- [x] #4 A validated selection writes the non-secret [tracker.jira] block, and no credential ever reaches .lore/config.toml
- [x] #5 Flags reproduce the profile and project-key answers without prompting
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New `src/adapters/jira-onboarding.ts`: a `JiraOnboarding` seam over `bunJiraSpawn` with `listProfiles()` (`jira config list-profiles`) and `describeProject(key, profile)` (`jira project get <KEY> --profile <p>`). Failures carry jira-cli's own `error` string from its stderr envelope; a 404 becomes not_found, an auth/profile failure denied. No credential is ever read or written.
2. Add `InitPrompter.ask(question, defaultValue)` for free text. `choose` lowercases its answer, so it cannot select a mixed-case profile name; the profile question uses `ask` and validates the answer against the live profile list.
3. Add `--jira-profile <name>` and `--jira-project <KEY>` (AC#5). Both are rejected outside `--tracker jira`.
4. `configureJira()` shared by both paths: list profiles; zero profiles throws not_found naming `jira init` (AC#1); confirm the profile, defaulting to jira-cli's `isDefault` (AC#2); read the project key; validate it with `describeProject` and let jira's reason propagate (AC#3). Non-interactive `--tracker jira` without both flags is a usage error, so nothing partial is written.
5. Derive `issue_type` from the validated project's own `issue_types` (prefer Task, else the first non-Subtask) — zero extra calls, since validation already fetched it. `status_flow` starts at Jira's default scheme (To Do/In Progress/Done); `default_labels` empty.
6. `persistJiraTracker(root, config)` writes the `[tracker.jira]` block next to `[tracker].backend`, preserving unrelated bytes exactly as `withTrackerBackend` does. Both paths call the same writer, so the existing wizard-equals-flag byte-identity test still holds.
7. Tests: new `test/jira-onboarding.test.ts` for the adapter seam; `test/init.test.ts` for all five ACs plus the no-credential assertion; update `scriptedPrompter`/`forbiddenPrompter` for `ask`. Run lint, typecheck, and the full suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned, with three findings worth recording.

**`choose` could not have served the profile question.** It lower-cases its answer before matching, which is right for Lore's own fixed vocabularies and wrong for a name someone else chose — a profile called `Salient` was unselectable. That is why `InitPrompter` gained `ask` rather than reusing `choose`; a regression test picks `Salient` from a two-profile list.

**The written table needs more than the two answers.** `createJiraAdapter` requires `issue_type` and a non-empty `status_flow`, so profile+project alone would have left the same broken bundle this task exists to fix, one field later. `issue_type` is read from the validated project's own `issue_types` (prefer Task, else the first non-Subtask) — zero extra calls, since `jira project get` already ran for validation. `status_flow` starts at Jira's default scheme (To Do/In Progress/Done); `jira metadata statuses` is instance-wide (43 entries, names duplicated across schemes) and cannot be ordered into a project's workflow, so deriving it there would have been a guess wearing evidence's clothes. The operator edits it.

**The scaffolded config already contains a commented-out `# [tracker.jira]` example.** A raw substring assertion for 'nothing was written' passes against that template on its own, so the test helper strips comment lines first — otherwise AC#1's no-partial-write check would have been vacuous.

Validation, all local:
- `bun test`: 2739 pass, 0 fail, 91 files (was 2710/90). `bun run lint` and `bun run typecheck` clean.
- Live against real jira-cli 1.0.2 and the real `salient` profile / `SD` project, using the compiled `dist/lore`:
  - `--tracker jira --jira-profile salient --jira-project SD` -> exit 0; config carries backend=jira plus profile/project/issue_type=Task/default_labels/status_flow, and no credential.
  - the same run with `--check-tracker` -> `trackerCheck {checked:true, backend:jira, capable:true, version:1.0.2}`. The bundle this writes is usable, which is the whole defect.
  - `--jira-project NOPEKEY` -> exit 3 with jira-cli's own sentence ('No project could be found with key NOPEKEY.'), no config written.
  - `--jira-profile typo` -> exit 6; `--tracker jira` with no flags -> exit 2; `--jira-profile` without `--tracker jira` -> exit 2.
- No docker/e2e case exercises a jira selection, and none was added: the container has no Jira credentials, so a real selection cannot run there. LCLI-360 already tracks the unexecuted e2e cases.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`lore init --tracker jira` used to write `backend = "jira"` and no `[tracker.jira]` table, so the very next tracker command failed with 'tracker.jira configuration is required'. New `src/adapters/jira-onboarding.ts` performs the two live jira-cli reads that fix it — `config list-profiles` and `project get <KEY> --profile <name>` — and `configureJira` in `src/commands/init.ts` drives both the wizard and the flag path through them, resolving and validating the table before the selection is persisted. Zero profiles exits naming `jira init` (which Lore never runs, because it is interactive and credential-bearing); an unresolvable key fails carrying jira-cli's own sentence; nothing partial is written on either failure. `InitPrompter` gained `ask` for free text, since `choose` lower-cases its answer and could not select a mixed-case profile name. `--jira-profile` and `--jira-project` are the prompt-free equivalents and are rejected without `--tracker jira`. Verified with `bun test` (2739 pass, 0 fail), clean lint/typecheck, and live runs of the compiled binary against jira-cli 1.0.2 and a real Jira project: the configured bundle probes `capable: true`, and the bad-key, bad-profile, and missing-flag paths exit 3/6/2 writing no configuration.
<!-- SECTION:FINAL_SUMMARY:END -->
