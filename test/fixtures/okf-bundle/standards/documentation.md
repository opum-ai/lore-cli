---
type: Standard
title: Documentation
summary: The rules for writing lore documentation that stays coherent and cheap to retrieve.
timestamp: 2026-10-06T00:00:00Z
---

# Documentation

## Purpose

Keep every bundle's documentation coherent, coupled to its tasks, and cheap to
retrieve, so a reader trusts what they find.

## Scope

Every concept under a project's `docs/` bundle, and the managed blocks the lore
CLI writes into them.

## Rules

1. DOC-1 MUST keep each concept's `type`, `title` and `summary` present and honest.
2. DOC-2 MUST link a task to the concept it changes, so the coupling gate has
   something to judge.
3. DOC-3 SHOULD prefer a section anchor over a whole document when citing a
   stable part of it.

## Enforcement

`lore check` enforces DOC-1 and DOC-2. DOC-3 is unenforced, so the gap is visible.

## Exceptions

A bundle produced by a migration MAY carry types its active profile does not
declare until the migration completes.

## Related

- [Use OKF for the sample bundle](../adr/0001-use-okf.md)
