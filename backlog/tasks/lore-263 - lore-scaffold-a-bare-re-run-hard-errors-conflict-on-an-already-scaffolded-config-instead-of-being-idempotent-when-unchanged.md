---
id: LORE-263
title: >-
  lore scaffold: a bare re-run hard-errors (conflict) on an already-scaffolded
  config instead of being idempotent-when-unchanged
status: To Do
assignee: []
created_date: '2026-07-25 02:09'
labels:
  - cli-ux
  - cmd-meta-c
dependencies: []
references:
  - src/commands/scaffold.ts
priority: low
type: enhancement
ordinal: 365000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Re-running 'lore scaffold <target>' on a bundle that already has that config should be a safe no-op when the on-disk config is unchanged (exit 0, 'nothing to do'), matching 'lore sync's idempotency model — rather than hard-failing so the user has to hand-edit the file or remember --force.

## Observed (Meridian stress test)
'lore scaffold obsidian' hard-errors with error_type: conflict if docs/.obsidian/ already exists — it is NOT additive/re-runnable. To confirm or repair Obsidian settings on an already-scaffolded bundle you must inspect/edit docs/.obsidian/app.json directly (or pass --force, which overwrites). This surprised the tester and blocks a 'just re-assert the config' workflow. (Same never-clobber applies to mkdocs/docusaurus targets.)

## Nuance (why this isn't just 'use --force')
The never-clobber + --force design is deliberate: it protects a user's hand-customized config (e.g. edited app.json) from silent overwrite. But erroring even when the on-disk config is BYTE-IDENTICAL to what scaffold would generate is unnecessary friction. The good pattern already exists in lore: 'lore sync' reports '0 files changed' when nothing differs.

## Direction (decide in plan)
- Make a bare re-run IDEMPOTENT: if the existing generated file(s) are byte-identical to what would be produced, no-op with exit 0 and a 'nothing to do' line; only raise the conflict (and point at --force) when the on-disk config DIFFERS (i.e. the user modified it). Apply uniformly to obsidian/mkdocs/docusaurus.
- At minimum, make the conflict error message explicitly tell the user to re-run with --force (surface the recovery path).

## Refs
src/commands/scaffold.ts; the writeAllOrRollback never-clobber/--force path in src/commands/fswrite.ts; 'lore sync's idempotency ('0 files changed') as the pattern to mirror.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Re-running 'lore scaffold <target>' when the existing generated config is byte-identical to what it would generate is a no-op: exit 0 with a clear 'nothing to do / unchanged' message (mirrors sync's '0 files changed'), for obsidian, mkdocs, and docusaurus.
- [ ] #2 When the on-disk config DIFFERS from what scaffold would generate (user-modified), lore still refuses to clobber, and the conflict error explicitly points the user at --force.
- [ ] #3 '--force' behavior is unchanged (overwrites to the freshly-generated config).
- [ ] #4 Regression tests cover unchanged-re-run (no-op), user-modified-re-run (conflict + --force hint), and --force overwrite; full suite + lore check stay green.
<!-- AC:END -->
