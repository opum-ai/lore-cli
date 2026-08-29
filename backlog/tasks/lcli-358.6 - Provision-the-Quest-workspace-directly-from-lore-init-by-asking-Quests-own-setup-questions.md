---
id: LCLI-358.6
title: >-
  Provision the Quest workspace directly from lore init by asking Quest's own
  setup questions
status: To Do
assignee: []
created_date: '2026-08-28 21:47'
updated_date: '2026-08-28 21:47'
labels:
  - init
  - tracker
  - quest
  - blocked
dependencies: []
references:
  - >-
    Blocked on opum-ai/quest-cli QCLI-136 — Expose every quest init setup answer
    as a flag. Released as a pair with this work.
parent_task_id: LCLI-358
ordinal: 485000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Quest is Lore's default and first-class tracker, so `lore init` asks Quest's own setup questions inline and runs `quest init` itself — no printed command, no exit. Backlog and Jira keep the escape-hatch pattern because their initializers are interactive (`backlog init` is a TUI that even offers its own git init) or credential-bearing (`jira init`).

**Blocked on opum-ai/quest-cli QCLI-136.** Released Quest 0.2.9 cannot accept the answers — confirmed 2026-08-28:

    $ quest init --name demo --task-id-prefix DEMO --json
    {"error_type":"usage","message":"init accepts only --agent-instructions, --json, and --plain."}

QCLI-136 exposes a flag per question plus a discoverable flag set and a stated minimum version. The two packages release as a pair, so this subtask lands only against a Quest build that carries those flags. Until then `quest init --json` provisions an unnamed workspace and silently drops the user's answers, which is not acceptable to ship.

Gate on the Quest minimum version from LCLI-358.2's floor, not on an exact version.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore init asks Quest's documented setup questions and provisions the workspace by invoking quest init with the answers as flags
- [ ] #2 The run is gated on a Quest version that supports those flags, and an older Quest fails with a diagnostic naming the minimum version
- [ ] #3 quest init is never left to prompt: Lore always drives it non-interactively
- [ ] #4 A Quest workspace already initialized in this repository is detected and not re-provisioned
<!-- AC:END -->
