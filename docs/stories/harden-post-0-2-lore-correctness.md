---
type: Story
title: Harden post-0.2 Lore correctness
tags:
  - correctness
  - post-0.2
  - quality
summary: Own active correctness fixes discovered after Lore 0.2.0 without mixing them into historical delivery evidence.
timestamp: 2026-08-13T17:12:06.481Z
status: done
tasks:
  - lcli-323
  - lcli-324
  - lcli-335
  - lcli-339
  - lcli-340
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
| [LCLI-323](../../backlog/tasks/lcli-323%20-%20lore-check-strict-is-wall-clock-dependent-an-elapsed-stale_after-flips-a-green-bundle-to-exit-6-with-no-commit.md) | lore check --strict is wall-clock dependent: an elapsed stale_after flips a green bundle to exit 6 with no commit | Done |
| [LCLI-324](../../backlog/tasks/lcli-324%20-%20lore-check-silently-skips-relative-links-that-leave-docs-so-a-green-check-overstates-what-it-verified.md) | lore check silently skips relative links that leave docs/, so a green check overstates what it verified | Done |
| [LCLI-335](../../backlog/tasks/lcli-335%20-%20Prevent-Bun-environment-file-access-from-breaking-Lore-Backlog-probes.md) | Prevent Bun environment-file access from breaking Lore Backlog probes | Done |
| [LCLI-339](../../backlog/tasks/lcli-339%20-%20Declare-the-reserved-principal-field-on-the-success-error-and-uncaught-envelopes.md) | Declare the reserved principal field on the success, error, and uncaught envelopes | Done |
| [LCLI-340](../../backlog/tasks/lcli-340%20-%20Manifest-kind-registry-init-and-new-declare-bare-kinds-and-agents-other-emitted-kinds-are-undiscoverable.md) | Manifest kind registry: init and new declare bare kinds, and agent's other emitted kinds are undiscoverable | Done |
<!-- lore:tasks:end -->

## Notes

The Story was opened for the post-`0.2.0` correctness campaign tracked in
Backlog. Fixes are linked as they enter an execution wave so the managed task
rollup reflects live work rather than a promised queue.
