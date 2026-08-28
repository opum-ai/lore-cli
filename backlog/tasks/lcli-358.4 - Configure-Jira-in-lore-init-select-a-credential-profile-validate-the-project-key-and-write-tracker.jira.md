---
id: LCLI-358.4
title: >-
  Configure Jira in lore init: select a credential profile, validate the project
  key, and write [tracker.jira]
status: To Do
assignee: []
created_date: '2026-08-28 21:47'
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
- [ ] #1 Zero jira-cli profiles exits with the `jira init` command and no partial configuration written
- [ ] #2 One or more profiles are listed for the user to confirm, defaulting to jira-cli's default profile
- [ ] #3 The entered project key is validated live against the chosen profile, and a failure is reported with jira-cli's own reason rather than a generic error
- [ ] #4 A validated selection writes the non-secret [tracker.jira] block, and no credential ever reaches .lore/config.toml
- [ ] #5 Flags reproduce the profile and project-key answers without prompting
<!-- AC:END -->
