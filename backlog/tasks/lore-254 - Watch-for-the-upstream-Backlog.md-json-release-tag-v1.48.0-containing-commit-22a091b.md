---
id: LORE-254
title: >-
  Watch for the upstream Backlog.md --json release tag (>v1.48.0 containing
  commit 22a091b)
status: To Do
assignee: []
created_date: '2026-07-24 18:41'
labels:
  - release
  - tooling
dependencies: []
references:
  - 'https://github.com/MrLesk/Backlog.md/releases'
priority: medium
type: chore
ordinal: 356000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
A reliable signal that fires when MrLesk/Backlog.md publishes a tag NEWER than v1.48.0 whose history includes commit 22a091b (PR #790 / BACK-545), so the adapter-migration work (LORE-253) can be picked up promptly instead of sitting stale.

## Why it matters
lore's entire first-release gate hinges on this one upstream event, and nothing currently watches for it. The latest upstream tag (v1.48.0, 2026-07-12) is 10 commits behind the --json merge. Without a trigger, LORE-253 and lore's first release can stall indefinitely after upstream ships.

## Context
Companion to LORE-253 (the migration this unblocks). A lightweight approach: a scheduled CI check or a documented cadence that queries the MrLesk/Backlog.md releases API and asserts the tag's commit is at/past 22a091b — or probes the released binary for --json directly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A mechanism (scheduled CI job, release-watch, or a documented manual cadence) detects a new MrLesk/Backlog.md tag whose history contains commit 22a091b and surfaces it to the maintainer.
- [ ] #2 It distinguishes a --json-capable tag from a plain one (asserts the commit is an ancestor of the tag, or probes the released binary for --json), not just any new tag.
- [ ] #3 Where the signal lands and who acts on it is documented, linking to the migration task (LORE-253).
<!-- AC:END -->
