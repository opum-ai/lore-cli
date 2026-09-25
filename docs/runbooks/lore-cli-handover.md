---
type: Runbook
title: Lore CLI handover
tags:
  - handover
  - routing
  - release
  - documentation
  - quest
summary: Routes a fresh Lore CLI session to live Quest, Git, documentation, and release evidence through the opum-handoff skill, without carrying a cursor.
timestamp: 2026-08-03T16:05:16.512Z
---

# Lore CLI handover

## Purpose

This document routes a fresh Lore CLI session to live evidence. It carries no
task cursor, branch claim, runnable queue, or release assertion. The procedure
lives in the `opum-handoff` skill from the `opum-workflow` plugin. Historical
handovers are provenance records and must not be executed.

## Fresh-session route

1. Run the `opum-handoff` skill in `restore` mode. It reads live state in a
   fixed trust order: first the Quest tracker and the Git repository, then the
   campaign Story's live rollup from `lore tasks <story>`, and last the
   session cursor at `.claude/handovers/cursor.md`. The cursor only speeds up
   a restart and is never authoritative. When it disagrees with Quest or Git,
   the cursor is stale.
2. Treat the Quest record as authoritative for task status, dependencies,
   acceptance criteria, plans, and notes. Quest is this repository's tracker of
   record, and `.quest/` is committed. Handoff reasoning lands as notes on the
   Quest task, not in the cursor. Run `quest instructions overview` before the
   first tracker write.
3. Find documentation with `lore query "<words>" --limit 5`, then
   `lore read <id>`. The [Lore CLI documentation ownership](../reference/lore-cli-documentation-ownership.md)
   record says what this repository owns.
4. For Lore-wide strategy or cross-component contracts, open the consolidated
   [Lore documentation namespace](https://github.com/opum-ai/opum-doc/tree/dev/docs/lore).
   For portfolio or product-family questions, open the
   [Opum documentation hub](https://github.com/opum-ai/opum-doc/tree/dev/docs).
5. For release work, read [Lore CLI release truth](../reference/lore-cli-release-truth.md)
   before the [Release publishing](release-publishing.md) procedure. Reverify
   package versions, immutable tags and artifacts, and registry availability.

To hand over, run `opum-handoff` in `write` mode. Do not hand-write the cursor.

## Authority boundaries

- Quest owns task lifecycle data. Change it only through the `quest` CLI, with
  an explicit actor declaration on every write.
- Lore owns the documentation graph. Use Lore for creation, renames,
  Story/task coupling, synchronization, and checks.
- This repository owns Lore CLI implementation and release evidence. The
  consolidated Lore namespace and the Opum documentation hub own their own
  product and portfolio contracts. Quest product policy routes through its
  [external routing and provenance record](https://github.com/opum-ai/opum-doc/blob/dev/docs/quest/quest-external-routing-and-provenance.md).
- A plan, a passing test, a dry-run package, or a workflow procedure is not
  evidence of a public release.
- This handover grants no authority. Commit, push, pull-request, merge,
  publication, cleanup, and remote-policy actions need the authority that
  `CLAUDE.md` records for the action.

## Recovery

If live Quest, Git, release, and documentation evidence disagree, stop and
record the drift as a note on the owning Quest task. Reconcile the
authoritative state before starting new work. Do not recover by following
commands or cursors from `archive/handovers/`, from a `historical-*`
Reference, or from a stale session cursor.
