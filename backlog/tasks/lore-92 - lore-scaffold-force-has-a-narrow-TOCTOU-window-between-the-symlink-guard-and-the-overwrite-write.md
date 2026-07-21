---
id: LORE-92
title: >-
  lore scaffold --force has a narrow TOCTOU window between the symlink guard and
  the overwrite write
status: To Do
assignee: []
created_date: '2026-07-21 18:52'
labels:
  - backlog-campaign-followup
  - security
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
priority: low
type: bug
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
writeAllOrRollback's --force branch in src/commands/fswrite.ts (currently lines 322-337) calls assertNoSymlinkInPath(root, file.path) — the lstatSync-based, no-follow guard LORE-76 added — but then performs the actual overwrite several syscalls later via existsSync(abs) / readFileSync(abs) / writeFileOverwriting(abs, ...), a plain writeFileSync with no O_EXCL/O_NOFOLLOW. Nothing re-checks the target between the guard and the write. existsSync, readFileSync, and writeFileSync all transparently follow symlinks, so a symlink planted at the target path in that window is followed by the write instead of refused.

Reproduced the mechanism deterministically (not just by inspection): importing the real, unmodified assertNoSymlinkInPath and writeFileOverwriting exports and driving them in the same order writeAllOrRollback uses, the guard passes against a real file, the target is then swapped for a symlink pointing outside a simulated repo root, and the subsequent write follows the symlink and overwrites the outside file's content — confirming a process that wins a race in this window genuinely escapes the guard, not merely in theory.

Independently confirmed the non-force path is NOT affected: createIfAbsent's writeFileSync(absPath, contents, { flag: "wx" }) uses O_CREAT|O_EXCL, which POSIX guarantees fails EEXIST against any existing final-component entry including a symlink, regardless of its target. Existing LORE-76 symlink tests only cover a symlink planted BEFORE assertNoSymlinkInPath runs; none exercise a symlink planted AFTER the check, so this specific window is currently untested.

This exact gap was identified and explicitly deferred during LORE-76 itself, documented in that task's own Implementation Notes as a known, narrow, non-blocking finding — not a regression LORE-76 introduced. Practical severity is low: exploiting this requires a concurrent, co-located attacker process winning a race against a window of only a few synchronous syscalls, not reachable by a remote or unprivileged-network attacker, and lore's threat model is a local single-user CLI rather than a multi-tenant service. It matters because `lore scaffold --force` is meant to safely overwrite scaffold config files, and this window means that guarantee is not airtight against a racing process on a shared or multi-user machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 writeAllOrRollback's --force overwrite of an existing file provides the same TOCTOU guarantee the non-force branch already has: a symlink present at the target at the moment of the write is never followed to write outside the intended path, even if the target was a regular file when assertNoSymlinkInPath ran earlier in the same call.
- [ ] #2 A test demonstrates that a symlink swapped in at the overwrite target AFTER the existing symlink guard has already passed is still refused (or is not followed) by the actual write step — i.e. the guarantee holds at write time, not just at check time.
- [ ] #3 The --force branch's existing rollback guarantees (partial-plan rollback restores each already-overwritten file's previous bytes, an unreadable pre-existing file refuses before any write occurs, fresh-directory rollback removes only what the call itself created) continue to pass unchanged, per test/consumer-scaffold.test.ts's "never-silent-clobber" test block.
<!-- AC:END -->
