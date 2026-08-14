---
type: Runbook
title: Lore CLI handover
tags:
  - handover
  - routing
  - release
  - documentation
summary: Context-free route from a fresh session to live Lore CLI ownership, task, repository, and release evidence.
timestamp: 2026-08-03T16:05:16.512Z
---

# Lore CLI handover

## Purpose

Start a Lore CLI session from live owner evidence without copying a task
cursor, branch claim, runnable queue, or release assertion into this document.
This is the repository's only current handover. Historical handovers are
provenance records and must not be executed.

## Fresh-session route

1. Read the repository `AGENTS.md` and run `backlog instructions overview`.
2. Start at the [documentation index](../index.md), then read
   [Lore CLI documentation ownership](../reference/lore-cli-documentation-ownership.md).
3. For Lore-wide strategy or cross-component contracts, open the consolidated
   [Lore documentation namespace](https://github.com/opum-ai/opum-doc/tree/dev/docs/lore).
   For portfolio or product-family questions, open the
   [Opum documentation hub](https://github.com/opum-ai/opum-doc/tree/dev/docs).
   Do not recreate those mutable rules in this handover.
4. Inspect live non-terminal tasks through the Backlog CLI. Treat task status,
   dependencies, acceptance criteria, plans, and notes as authoritative.
5. Follow the owning Story from [Stories](../stories/index.md), and use
   `lore tasks <story>` to reconcile its rollup before acting.
6. Ground the canonical `opum-ai/lore-cli` repository with the current branch,
   exact HEAD, status, local ahead/behind state, remote URL, and registered
   worktrees. Preserve unrelated changes.
7. For release work, read [Lore CLI release truth](../reference/lore-cli-release-truth.md)
   before the [Release publishing](release-publishing.md) procedure. Reverify
   package versions, immutable tags and artifacts, registry availability, and
   the live LCLI-253/LCLI-278 owner gates.

## Authority boundaries

- Backlog owns task lifecycle data; mutate it only through the Backlog CLI.
- Lore owns the documentation graph; use Lore for creation, renames,
  Story/task coupling, synchronization, and checks.
- This repository owns Lore CLI implementation and release evidence. The
  consolidated Lore namespace and Opum documentation hub above own their
  respective mutable product and portfolio contracts. Lore-wide policy routes
  through the consolidated
  [`opum-ai/opum-doc` Lore authority surface](https://github.com/opum-ai/opum-doc/blob/dev/docs/lore/index.md);
  product-family and Opum commercial policy live in `opum-ai/opum-doc`; Quest
  product policy routes through its
  [external routing and provenance record](https://github.com/opum-ai/opum-doc/blob/dev/docs/quest/quest-external-routing-and-provenance.md),
  while Quest CLI implementation and release evidence remain component-local.
- A plan, passing test, dry-run package, or workflow procedure is not evidence
  of a public release.
- Commit, push, pull-request, merge, publication, cleanup, and remote-policy
  actions require the authority applicable to the current task. This handover
  grants none of them.

## Recovery

If live Backlog, Git, release, and documentation evidence disagree, stop and
record the drift in the owning task. Reconcile authoritative state before new
work. Do not recover by following commands or cursors from files under
`archive/handovers/` or from a `historical-*` Reference.
