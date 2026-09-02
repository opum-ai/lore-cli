---
id: LCLI-374
title: Quest --doc doesn't satisfy lore orphans until lore link runs
status: To Do
assignee: []
created_date: '2026-09-02 20:19'
labels: []
dependencies: []
references:
  - >-
    Reported in an issues dump relayed via opum-agent from other agents'
    lore/quest sessions
  - 2026-09-02; independently reproduced against quest 0.3.0
modified_files:
  - src/commands/orphans.ts
  - src/adapters/quest.ts
priority: high
type: bug
ordinal: 501000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Quest's task create/edit --doc <path> writes only Quest's own documentation array (src/adapters/quest.ts:282,292); it never touches the Story's tasks: frontmatter or adds a doc:<conceptId> label. Both of those are exclusively written by lore link (src/commands/link.ts:230,271-276). Meanwhile lore orphans (src/commands/orphans.ts:190-205,248-250) computes orphanTasks purely from tasks: frontmatter plus the doc: label -- documentation is never consulted -- so a task with only --doc set reads as a silent orphan until someone remembers to run lore link. lore check does not catch this: it never calls orphans at all (orphans.ts:26-35 documents this as a report, not a gate), so this is a genuine gap, not a documentation oversight to fix elsewhere.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore orphans consults Quest's documentation field (or an equivalent back-reference) as well as tasks:/doc: label, so a --doc-linked task is not reported as a dangling orphan before lore link runs
- [ ] #2 if --doc-only linkage is intentionally treated as incomplete/pending rather than fully-linked, orphans reports it as a distinct category (e.g. pending-link) rather than an indistinguishable dangling orphan
- [ ] #3 regression test creates a Quest task with --doc pointing at a Story, asserts lore orphans does not flag it as fully dangling before lore link, and asserts the correct state after lore link runs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Confirmed 2026-09-02 against dev source + quest 0.3.0: quest task create ... --doc docs/stories/<story>.md produced task JSON with documentation:[...] but labels:[]; the Story's tasks: frontmatter stayed absent; lore orphans --json reported the task under orphanTasks; lore check stayed exit 0 throughout (by design -- it never calls orphans). Running lore link stories/<story> <task-id> then added tasks: to the Story and a doc: label to the task, clearing the orphan report. Root cause: src/commands/orphans.ts's known-tasks/orphan computation reads only tasks:/doc: label, never Quest's documentation field.
<!-- SECTION:PLAN:END -->
