---
type: Story
title: Retrieve task-scoped context with agent profiles
tags:
  - agents
  - context
  - retrieval
  - claude
  - codex
summary: Let existing Claude Code and Codex agents retrieve bounded, role-specific Lore evidence for an assigned task.
timestamp: 2026-08-01T17:28:19.790Z
status: done
tasks:
  - lcli-289
---

# Retrieve task-scoped context with agent profiles

## Goal

Let an existing Claude Code or Codex agent name a committed Lore context
profile and retrieve one bounded, task-specific evidence pack from the
documents explicitly assigned to that role. A frontend agent can receive UI,
style, accessibility, and relevant decision context without loading unrelated
backend material. An orchestrator can discover permitted worker profiles
without absorbing every worker's documents.

## Acceptance criteria

- Teams can define reviewable specialist and orchestrator context mappings
  without duplicating native agent prompts, tools, models, or permissions.
- A native agent can request one source-attributed Markdown or JSON context
  pack for its profile and assigned task.
- Mandatory constraints are always included; remaining linked material is
  selected at Markdown-section granularity within a declared budget.
- The result names every allowed source and honestly reports omissions,
  truncation, estimates, and provenance.
- An orchestrator receives its own context plus a compact direct-delegate
  roster, while each worker retrieves its own profile independently.
- Identical repository, profile, task, and budget inputs produce identical
  output without embeddings, model calls, network access, or hosted services.
- Claude Code and Codex use one stable opt-in instruction; Lore does not create
  or patch their native agent definitions.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-289](../../backlog/tasks/lcli-289%20-%20Add-task-scoped-agent-context-profiles.md) | Add task-scoped agent context profiles | Done |
<!-- lore:tasks:end -->

## Notes

The executable contract is
[Agent profile context retrieval](../specs/agent-profile-context-retrieval.md).
The operating procedure is
[Agent profile implementation and operation](../runbooks/agent-profile-operation.md).

Cross-repository rationale and supporting prior art are maintained in the
consolidated [Lore documentation namespace](https://github.com/opum-ai/opum-doc/tree/dev/docs/lore),
not in a legacy `lore-doc` route. The former `lore-doc` sources are retained as
**historical provenance**. The
consolidated Opum documentation now carries the current active Lore-wide
[agent-profile decision](https://github.com/opum-ai/opum-doc/blob/dev/docs/lore/adr/define-agent-profiles-as-context-mappings.md)
and supporting [context-engineering policy](https://github.com/opum-ai/opum-doc/blob/dev/docs/lore/reference/agent-profile-context-engineering-research.md).
This Story's executable contract and operating procedure remain component-local.
