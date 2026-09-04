---
type: Story
title: Maintain Lore CLI documentation authority
tags:
  - documentation
  - authority
  - release-truth
  - handover
summary: Keep release truth, task ownership, documentation routing, and historical handovers coherent.
timestamp: 2026-08-03T16:05:06.929Z
status: done
tasks:
  - lcli-293
  - lcli-292
  - lcli-294
  - lcli-322
  - lcli-325
  - lcli-329
  - lcli-328
  - lcli-308
  - lcli-309
  - lcli-310
  - lcli-311
  - lcli-341
  - lcli-342
  - lcli-345
---

# Maintain Lore CLI documentation authority

## Goal

Keep Lore CLI's active entry points, release evidence, handover lifecycle,
cross-repository ownership, and Story/task coupling coherent without changing
product or release state.

## Acceptance criteria

- Active documentation distinguishes implemented release mechanics from an
  immutable public release.
- Exactly one current handover routes a fresh session through live evidence;
  old handovers are non-executable provenance.
- Every Backlog task has one appropriately scoped Story owner without lifecycle
  mutation.
- Root navigation reaches the controlling Story, ADR, Spec, release truth,
  ownership map, and current handover.
- Strict Lore, agent, orphan, rollup, and Git checks pass.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-293](../../.quest/tasks/LCLI-293.json) | Reconcile Lore CLI release truth handover lifecycle and Story ownership | Done |
| [LCLI-292](../../.quest/tasks/LCLI-292.json) | Adapt backlog-handover skill for Lore CLI | Done |
| [LCLI-294](../../.quest/tasks/LCLI-294.json) | Transfer Lore CLI repository to opum-ai and reconcile canonical location | Done |
| [LCLI-322](../../.quest/tasks/LCLI-322.json) | Restore single-active-cursor hygiene for ignored handover archives | Done |
| [LCLI-325](../../.quest/tasks/LCLI-325.json) | README Install section still pins 0.1.0 and describes the shipped 0.2.0 install fix as a future release | Done |
| [LCLI-329](../../.quest/tasks/LCLI-329.json) | Adopt the autonomous documentation campaign fast lane | Done |
| [LCLI-328](../../.quest/tasks/LCLI-328.json) | backlog-handover can invoke self-committing Lore commands without commit authority | Done |
| [LCLI-308](../../.quest/tasks/LCLI-308.json) | Route fleet cross-repo questions to opum-doc and correct the stale Quest CLI owner | Done |
| [LCLI-309](../../.quest/tasks/LCLI-309.json) | Correct the stale herdr delivery derivation and the fact-shaped instructions it exposed | Done |
| [LCLI-310](../../.quest/tasks/LCLI-310.json) | Close adverb-shaped prohibitions, ownership-without-prohibition, and the second hand-listed gate | Done |
| [LCLI-311](../../.quest/tasks/LCLI-311.json) | Make the loophole guidance a general rule, not a curated list of shapes | Done |
| [LCLI-341](../../.quest/tasks/LCLI-341.json) | Align FMC Worker identity and user-level skill authority | Done |
| [LCLI-342](../../.quest/tasks/LCLI-342.json) | Record exact FMC Controller authorization delegation | Done |
| [LCLI-345](../../.quest/tasks/LCLI-345.json) | Reconcile Lore Story ownership for the ODOC-66 documentation closeout | Done |
<!-- lore:tasks:end -->

## Notes

This Story implements the Lore CLI owner action routed from the consolidated
[Lore documentation namespace](https://github.com/opum-ai/opum-doc/tree/dev/docs/lore)
and the [Opum documentation hub](https://github.com/opum-ai/opum-doc/tree/dev/docs).
Its local control set is [Lore CLI release truth](../reference/lore-cli-release-truth.md),
[Lore CLI documentation ownership](../reference/lore-cli-documentation-ownership.md),
and the [Lore CLI handover](../runbooks/lore-cli-handover.md).
