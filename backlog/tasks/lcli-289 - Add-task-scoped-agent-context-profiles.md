---
id: LCLI-289
title: Add task-scoped agent context profiles
status: To Do
assignee: []
created_date: '2026-07-31 01:16'
updated_date: '2026-07-31 01:16'
labels:
  - agents
  - context
  - retrieval
  - claude
  - codex
  - 'doc:stories/retrieve-task-scoped-context-with-agent-profiles'
dependencies:
  - LCLI-283.1.3
references:
  - >-
    https://github.com/salient-data/lore-doc/blob/dev/docs/adr/define-agent-profiles-as-context-mappings.md
  - >-
    https://github.com/salient-data/lore-doc/blob/dev/docs/reference/agent-profile-context-engineering-research.md
documentation:
  - docs/stories/retrieve-task-scoped-context-with-agent-profiles.md
  - docs/specs/agent-profile-context-retrieval.md
  - docs/runbooks/agent-profile-implementation-handover.md
priority: high
type: feature
ordinal: 404000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add named, version-controlled context profiles that let existing Claude Code and Codex agents retrieve deterministic task-scoped evidence from explicitly linked Lore documentation. Lore owns context mappings and orchestrator delegate rosters; it does not create agents, run models, or add hosted or MCP behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Strict specialist and orchestrator profiles validate names, budgets, pinned and ranked references, delegates, and acyclic relationships while a missing profile directory remains backward compatible.
- [ ] #2 lore agent list, show, and context expose documented plain and JSON contracts with semantic errors and preserve every existing command contract.
- [ ] #3 Context packs rank Markdown sections only inside the explicit profile allowlist, preserve mandatory pins and provenance, respect bounded output, and remain deterministic across indexed and reference retrieval.
- [ ] #4 Orchestrator packs include only their own evidence and a compact direct-delegate roster; delegated workers retrieve their own profile context.
- [ ] #5 Context emits to stdout by default and optionally writes safely and atomically without silent overwrite, symlink traversal, or repository path escape.
- [ ] #6 Generated Lore guidance documents the one-line Claude Code and Codex opt-in without creating or patching native agent definitions, and automated tests plus strict Lore gates pass.
<!-- AC:END -->
