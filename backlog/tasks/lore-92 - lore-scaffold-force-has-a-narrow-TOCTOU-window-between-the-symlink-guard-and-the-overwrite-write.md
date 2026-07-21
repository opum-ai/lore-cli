---
id: LORE-92
title: >-
  lore scaffold --force has a narrow TOCTOU window between the symlink guard and
  the overwrite write
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 18:52'
updated_date: '2026-07-21 19:58'
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
- [x] #1 writeAllOrRollback's --force overwrite of an existing file provides the same TOCTOU guarantee the non-force branch already has: a symlink present at the target at the moment of the write is never followed to write outside the intended path, even if the target was a regular file when assertNoSymlinkInPath ran earlier in the same call.
- [x] #2 A test demonstrates that a symlink swapped in at the overwrite target AFTER the existing symlink guard has already passed is still refused (or is not followed) by the actual write step — i.e. the guarantee holds at write time, not just at check time.
- [x] #3 The --force branch's existing rollback guarantees (partial-plan rollback restores each already-overwritten file's previous bytes, an unreadable pre-existing file refuses before any write occurs, fresh-directory rollback removes only what the call itself created) continue to pass unchanged, per test/consumer-scaffold.test.ts's "never-silent-clobber" test block.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed fresh against current dev HEAD before implementing: writeAllOrRollback's
--force branch (src/commands/fswrite.ts, ~lines 336-354 at pickup time — drifted from the
filing task's 322-337 citation because LORE-94 added ~18 lines to this same file earlier in
the campaign) calls assertNoSymlinkInPath (a check-then-act lstatSync walk) and then, several
syscalls later, writes via the shared writeFileOverwriting (a plain writeFileSync that
transparently follows symlinks). Nothing re-checks the target in between, so a symlink planted
in that window is followed instead of refused.

Fix (AC#1): added writeFileNoFollow, a new exported primitive in fswrite.ts that opens the
target via openSync with O_WRONLY|O_CREAT|O_TRUNC|O_NOFOLLOW (verified empirically that Node
accepts a numeric flags value built from node:fs's `constants`, not just the string-flag form),
writes via writeSync, and closes the fd. O_NOFOLLOW makes the open() itself fail with ELOOP if
the final path component is a symlink -- closing the race structurally, at the single syscall
that performs the write, rather than re-checking-then-still-racing. ioError now maps ELOOP to
the same `conflict` LoreError a pre-existing symlink already gets from assertNoSymlinkInPath.
writeAllOrRollback's --force branch now calls writeFileNoFollow instead of writeFileOverwriting
in both its write sites (the "file already exists" overwrite AND the "file doesn't exist yet"
create-under-force case, since the same race class applies to both). Scope deliberately confined
to writeAllOrRollback's --force branch only -- did NOT change the shared writeFileOverwriting
itself, since its other callers (lore replace/rename/supersede) write back over a concept file
the bundle loader just read, and that loader (core/bundle.ts's walkFiles) already unconditionally
skips symlinked files during its walk (verified: `entry.isSymbolicLink()` -> warn + skip, never
recursed/read), so their target was never a symlink to begin with -- changing that function too
would have been unrequested scope creep with no corresponding AC.

AC#2: added a regression test in test/replace.test.ts (colocated with this file's existing
low-level fswrite-primitive tests, matching the established writeFileOverwriting/writeFileAtomic
precedent there) that drives the REAL, unmodified assertNoSymlinkInPath and writeFileNoFollow
exports in writeAllOrRollback's own order: a real file passes the guard, is then swapped for a
symlink to an outside file (simulating the race window deterministically, mirroring the filing
task's own repro methodology), and the subsequent writeFileNoFollow call is asserted to throw a
`conflict` LoreError while the outside file's content stays untouched. Added a second test for
the force-create branch's own equivalent case (symlink present from the very start, never a
regular file). Both POSIX-only, matching this codebase's existing symlink-test skip guard.

AC#3: full test/consumer-scaffold.test.ts suite (52 tests, including the "never-silent-clobber"
block's rollback-restores-previous-bytes / refuses-before-writing / removes-only-what-it-created
cases) re-ran unchanged and green -- confirms the write-path swap didn't alter any of
writeAllOrRollback's existing behavior for the normal (non-race) case.

Live-CLI verification (not just the synthetic-suite proof, per this campaign's standing
discipline for destructive/security fixes): wrote .repro-scratch/lore92-toctou-verify.ts,
driving the SAME race scenario against both the old writeFileOverwriting (still used elsewhere
in this module, confirmed to still follow the symlink and overwrite the outside file's content
with "HACKED" -- proving the underlying vulnerability mechanism is real, not hypothetical) and
the new writeFileNoFollow (confirmed to throw a conflict LoreError and leave the outside file's
content as "ORIGINAL", untouched).

Verified: bun test -> 1668 pass/0 fail (up from 1664); bun run typecheck clean; bun run lint
clean on all changed files (fswrite.ts, test/replace.test.ts) -- 4 pre-existing infos remain in
unrelated files (test/managed-block.test.ts, test/supersede.test.ts), untouched by this change.
<!-- SECTION:NOTES:END -->
