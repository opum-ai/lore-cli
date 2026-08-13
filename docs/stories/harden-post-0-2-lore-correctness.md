---
type: Story
title: Harden post-0.2 Lore correctness
tags:
  - correctness
  - post-0.2
  - quality
summary: Own active correctness fixes discovered after Lore 0.2.0 without mixing them into historical delivery evidence.
timestamp: 2026-08-13T17:12:06.481Z
status: in-progress
tasks:
  - lcli-323
---

# Harden post-0.2 Lore correctness

## Goal

Close active correctness defects discovered after the `0.2.0` release while
keeping each fix reproducible, honestly scoped, and coupled to live Backlog
work. This Story is the runnable owner for new fixes; the completed historical
hardening Story remains delivery evidence rather than an active bug queue.

## Acceptance criteria

- Date-sensitive validation and checking derive their result from an explicit,
  reproducible input rather than the machine clock.
- A passing check report states which link boundary it verified and exposes
  skipped targets instead of implying repository-wide coverage.
- Test harnesses cannot persist synthetic Git identity into a developer clone,
  and any decision about existing history remains explicit.
- Every linked fix carries focused negative controls, contract documentation,
  and strict Lore verification before delivery.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-323](../../backlog/tasks/lcli-323%20-%20lore-check-strict-is-wall-clock-dependent-an-elapsed-stale_after-flips-a-green-bundle-to-exit-6-with-no-commit.md) | lore check --strict is wall-clock dependent: an elapsed stale_after flips a green bundle to exit 6 with no commit | In Progress |
<!-- lore:tasks:end -->

## Notes

The Story was opened for the post-`0.2.0` correctness campaign tracked in
Backlog. Fixes are linked as they enter an execution wave so the managed task
rollup reflects live work rather than a promised queue.
