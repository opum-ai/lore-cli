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
| [LCLI-293](../../backlog/tasks/lcli-293%20-%20Reconcile-Lore-CLI-release-truth-handover-lifecycle-and-Story-ownership.md) | Reconcile Lore CLI release truth handover lifecycle and Story ownership | Done |
| [LCLI-292](../../backlog/tasks/lcli-292%20-%20Adapt-backlog-handover-skill-for-Lore-CLI.md) | Adapt backlog-handover skill for Lore CLI | Done |
<!-- lore:tasks:end -->

## Notes

This Story implements the Lore CLI owner action from the
[cross-product documentation authority audit](https://github.com/salient-data/opum-doc/blob/dev/docs/reference/cross-product-documentation-authority-audit.md).
Its local control set is [Lore CLI release truth](../reference/lore-cli-release-truth.md),
[Lore CLI documentation ownership](../reference/lore-cli-documentation-ownership.md),
and the [Lore CLI handover](../runbooks/lore-cli-handover.md).
