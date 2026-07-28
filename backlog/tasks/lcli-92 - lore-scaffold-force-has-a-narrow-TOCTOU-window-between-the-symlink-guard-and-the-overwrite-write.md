---
id: LCLI-92
title: >-
  lore scaffold --force has a narrow TOCTOU window between the symlink guard and
  the overwrite write
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:25'
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
writeAllOrRollback's --force branch in src/commands/fswrite.ts (currently lines 322-337) calls assertNoSymlinkInPath(root, file.path) — the lstatSync-based, no-follow guard LCLI-76 added — but then performs the actual overwrite several syscalls later via existsSync(abs) / readFileSync(abs) / writeFileOverwriting(abs, ...), a plain writeFileSync with no O_EXCL/O_NOFOLLOW. Nothing re-checks the target between the guard and the write. existsSync, readFileSync, and writeFileSync all transparently follow symlinks, so a symlink planted at the target path in that window is followed by the write instead of refused.

Reproduced the mechanism deterministically (not just by inspection): importing the real, unmodified assertNoSymlinkInPath and writeFileOverwriting exports and driving them in the same order writeAllOrRollback uses, the guard passes against a real file, the target is then swapped for a symlink pointing outside a simulated repo root, and the subsequent write follows the symlink and overwrites the outside file's content — confirming a process that wins a race in this window genuinely escapes the guard, not merely in theory.

Independently confirmed the non-force path is NOT affected: createIfAbsent's writeFileSync(absPath, contents, { flag: "wx" }) uses O_CREAT|O_EXCL, which POSIX guarantees fails EEXIST against any existing final-component entry including a symlink, regardless of its target. Existing LCLI-76 symlink tests only cover a symlink planted BEFORE assertNoSymlinkInPath runs; none exercise a symlink planted AFTER the check, so this specific window is currently untested.

This exact gap was identified and explicitly deferred during LCLI-76 itself, documented in that task's own Implementation Notes as a known, narrow, non-blocking finding — not a regression LCLI-76 introduced. Practical severity is low: exploiting this requires a concurrent, co-located attacker process winning a race against a window of only a few synchronous syscalls, not reachable by a remote or unprivileged-network attacker, and lore's threat model is a local single-user CLI rather than a multi-tenant service. It matters because `lore scaffold --force` is meant to safely overwrite scaffold config files, and this window means that guarantee is not airtight against a racing process on a shared or multi-user machine.
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
--force branch (src/commands/fswrite.ts, ~lines 336-354 at pickup time -- drifted from the
filing task's 322-337 citation because LCLI-94 added ~18 lines to this same file earlier in
the campaign) calls assertNoSymlinkInPath (a check-then-act lstatSync walk) and then, several
syscalls later, writes via the shared writeFileOverwriting (a plain writeFileSync that
transparently follows symlinks). Nothing re-checks the target in between, so a symlink planted
in that window is followed instead of refused.

Fix (AC#1): added writeFileNoFollow, a new exported primitive in fswrite.ts that opens the
target via openSync with O_WRONLY|O_CREAT|O_TRUNC|O_NOFOLLOW, writes via a looped writeSync
(see below), and closes the fd. O_NOFOLLOW makes the open() itself fail with ELOOP if the final
path component is a symlink, closing the race at the single syscall that performs the write.
writeAllOrRollback's --force branch calls writeFileNoFollow at both its write sites (overwriting
an existing file, and creating a fresh file under --force) AND in its own rollback-restore undo
callback (extended after review -- a symlink swapped in before a later-triggered rollback
deserves the same refusal). Scope deliberately confined to writeAllOrRollback's --force branch --
did NOT change the shared writeFileOverwriting itself, since its other callers (lore
replace/rename/supersede) write back over a file the bundle loader just read, and that loader
(core/bundle.ts's walkFiles) already unconditionally skips symlinked files during its walk
(verified directly: entry.isSymbolicLink() -> warn + skip, never recursed/read).

Independent review (general-purpose subagent, run after committing the fix+tests) found 2
BLOCKING issues, both fixed before merge:
1. writeSync's return value was discarded -- a short write (OS accepting fewer bytes than
   requested; a real POSIX possibility, e.g. disk-full mid-write) would silently truncate the
   file with no error and no rollback trigger. Fixed by extracting the accumulation loop into a
   new pure, exported writeAllBytes(write, buf) helper (mirrors writeFileSync's own internal
   loop) and unit-testing the loop itself deterministically with a fake writer that simulates
   short writes -- a genuine short write against a real fd isn't reliably reproducible in a test,
   which is exactly why the loop was extracted as an injectable-writer pure function rather than
   tested via a real large write alone. Also live-verified with a real 8MB write
   (.repro-scratch/lore92-large-write-verify.ts) round-tripping byte-for-byte.
2. O_NOFOLLOW is a POSIX-only flag -- independently confirmed via libuv's own docs
   (https://docs.libuv.org/en/v1.x/fs.html: UV_FS_O_NOFOLLOW "is not supported on Windows") that
   this fix's write-time protection does NOT extend to Windows, which this repo explicitly ships
   a binary for and runs in CI. This is NOT a new regression (Windows was equally exposed to this
   race before this fix), but the original docstring overclaimed "closes the race structurally"
   without a platform caveat. Fixed by adding an explicit Windows-gap paragraph to
   writeFileNoFollow's and writeAllOrRollback's docstrings, and filing a Not-queued follow-up
   candidate in the tracker (doc-1) for a human to confirm priority on a Windows-specific
   closure, since implementing one (Windows lacks a portable open-time symlink-refusal primitive)
   is a meaningfully bigger investigation outside this task's original scope.
Non-blocking findings also addressed: the ELOOP path now throws an explicit "it is a symlink"
message (mirroring assertNoSymlinkInPath's own wording) instead of routing through the generic
conflictError message that never mentioned "symlink"; closeSync is now routed through ioError
and structured so a close failure never masks a write failure that was already caught. Two
non-blocking findings were left as-is per the reviewer's own assessment (both narrow/theoretical,
pre-existing, outside this task's stated ACs): readExistingOrThrow's pre-write read still follows
symlinks, and ioError's ELOOP mapping is technically unreachable from schema.ts's pruneOrphans
call site (harmless).

AC#2: two POSIX-only regression tests in test/replace.test.ts drive the REAL, unmodified
assertNoSymlinkInPath and writeFileNoFollow exports in writeAllOrRollback's own order: a real
file passes the guard, is then swapped for a symlink to an outside file (simulating the race
window deterministically, mirroring the filing task's own repro methodology), and the subsequent
writeFileNoFollow call is asserted to throw a conflict LoreError while the outside file's content
stays untouched. A second test covers the force-create branch's own equivalent case (symlink
present from the very start).

AC#3: full test/consumer-scaffold.test.ts suite (52 tests, including the "never-silent-clobber"
block's rollback-restores-previous-bytes / refuses-before-writing / removes-only-what-it-created
cases) re-ran unchanged and green throughout every round of fixes.

Live-CLI verification (not just the synthetic-suite proof, per this campaign's standing
discipline for destructive/security fixes): .repro-scratch/lore92-toctou-verify.ts drives the
same race scenario against both the old writeFileOverwriting (confirmed to still follow the
symlink, overwriting the outside file's content with "HACKED") and the new writeFileNoFollow
(confirmed to throw "refusing to write f.md: it is a symlink, not a real file" and leave the
outside file's content as "ORIGINAL").

Verified (final round): bun test -> 1671 pass/0 fail (up from 1664 at session start); bun run
typecheck clean; bun run lint clean on all changed files -- 4 pre-existing infos remain in
unrelated files (test/managed-block.test.ts, test/supersede.test.ts), untouched.
<!-- SECTION:NOTES:END -->
