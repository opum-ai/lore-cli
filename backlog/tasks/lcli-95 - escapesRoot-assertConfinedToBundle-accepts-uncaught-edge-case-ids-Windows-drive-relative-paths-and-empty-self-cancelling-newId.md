---
id: LCLI-95
title: >-
  escapesRoot / assertConfinedToBundle accepts uncaught edge-case ids: Windows
  drive-relative paths and empty/self-cancelling newId
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:25'
labels:
  - backlog-campaign-followup
  - security
  - correctness
  - test-coverage
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
priority: low
type: bug
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
core/rewrite.ts's escapesRoot (rewrite.ts:265-281) — the traversal-walk helper shared by assertConfinedToBundle (rewrite.ts:241-250, guarding rewriteInbound's fromId/toId) and rename.ts's own argument-parsing-layer duplicate assertDestinationConfined (rename.ts:426-434) — has two independently-confirmed edge cases it does not reject, both verified live against current dev HEAD. Merging these two findings because they hit the exact same function and the exact same two guard call sites, and would naturally be closed by one completeness pass over escapesRoot's edge-case coverage.

(1) Windows drive-relative ids: an id shaped like "C:foo" (a drive letter and colon with no following separator — real Windows "relative to that drive's current directory" syntax, distinct from an absolute "C:\\..." path) passes every check assertConfinedToBundle relies on: win32.isAbsolute("C:foo") is false (Node correctly implements this as non-absolute), posix.isAbsolute("C:foo") is false, and escapesRoot's segment walk sees one segment with no separator and no literal "..", so it accepts it. Verified directly via Node's own path.win32 module. No test anywhere in the repo covers this exact shape — LCLI-72's own win32 test only covers the absolute form. Tracing the actual filesystem write (rename.ts's commitWrites -> fswrite.ts's moveFile, which always calls the platform-native path.join(docsRoot, plan.rename.to) before any OS call) shows the drive-relative segment gets embedded mid-path rather than handed to the OS in isolation, so real exploitability at the write layer on an actual Windows host is unconfirmed and likely narrower than a cross-drive escape — this cannot be verified further from a POSIX host.

(2) Empty or self-cancelling newId: escapesRoot tracks a directory-depth counter and only rejects a ".." segment seen at depth 0; an empty string or a self-cancelling relative path like "sub/.." both keep the counter at 0 throughout their walk, so escapesRoot returns false for both. idFromPath (posix.normalize) then folds either shape to ".", so rewriteInbound's toPath becomes the literal string "..md" — a hidden dotfile at the bundle root. Live-verified: `lore rename reference/orders ""` and `lore rename reference/orders "sub/.."` both exit 0, report a successful rename to docs/..md, and `lore check` afterward reports 0 errors/0 warnings — nothing downstream catches it either. By contrast, `lore new`'s resolveOutPath (the guard's own stated inspiration) explicitly rejects rel === "" with a usage error; escapesRoot never inherited that check when factored out in LCLI-80. This is not a containment escape (the write always lands inside docs/), just a silent-surprise correctness gap: a scripted rename whose destination resolves to an empty string succeeds silently instead of failing loudly.

Both gaps sit in the same shared function and the same two guard call sites, so both should be closed together — the same 'close every layer' pattern this campaign already applied via LCLI-78/79/80.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 rewriteInbound throws a validation LoreError when a fromId or toId is shaped like a Windows drive-relative reference (e.g. "C:foo", a drive letter/colon with no following separator) — the same rejection already given to an absolute path or a "../"-prefixed traversal.
- [x] #2 lore rename's own argument-parsing guard (assertDestinationConfined) rejects the identical drive-relative newId shape with a usage error before any bundle load, keeping parity with rewriteInbound's engine-layer guard.
- [x] #3 `lore rename <id> ""` is rejected with a clear error before any file is written or moved (no docs/..md appears, source file unchanged).
- [x] #4 `lore rename <id> "sub/.."` (or any other newId that normalizes to the bundle root itself) is likewise rejected before any write.
- [x] #5 The empty/self-cancelling rejection happens at the shared rewriteInbound engine layer (core/rewrite.ts), not only at rename.ts's own pre-check, so any other current or future caller of the shared engine gets the same protection.
- [x] #6 A real rename whose destination segment merely starts with ".." (e.g. "..foo/bar") or that legitimately cancels through a real intermediate directory to a non-root destination continues to succeed unaffected (no false-positive regression).
- [x] #7 Automated tests exercise all three previously-uncaught shapes (drive-relative "C:foo", empty string, and self-cancelling "sub/..") against escapesRoot/assertConfinedToBundle and/or lore rename end-to-end, and assert rejection at both the engine layer and rename's argument-parsing layer.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed fresh against current dev HEAD before implementing (line numbers matched the
filing task's own citations exactly, unlike the previous two sessions where fswrite.ts had
drifted -- core/rewrite.ts and commands/rename.ts were untouched by those sessions):

(1) Windows drive-relative ids: "C:foo" (a drive letter+colon with NO following separator, real
Windows "relative to that drive's current directory" syntax) passed assertConfinedToBundle
because win32.isAbsolute("C:foo") and posix.isAbsolute("C:foo") are both correctly false (verified
directly via node:path), and escapesRoot's segment walk sees one ordinary segment with no "..".

(2) Empty/self-cancelling newId: escapesRoot only rejects a ".." segment seen at depth 0 (a
genuine climb ABOVE the start); an empty string or "sub/.." both keep the depth counter at 0
throughout without ever going negative, so escapesRoot returns false for both. idFromPath's
posix.normalize then folds either to ".", and rewriteInbound's `${to}.md` template produces the
literal string "..md" -- verified the exact string concatenation in isolation before writing the
fix (to="." + literal ".md" suffix = "..md", a hidden dotfile at the bundle root).

Fix: two new exported functions in core/rewrite.ts, both reusable at the assertDestinationConfined
argument-parsing layer in rename.ts (AC#2), mirroring how escapesRoot itself is already shared:
- isDriveRelative(id): /^[A-Za-z]:(?![\\/])/ -- matches a single letter, colon, and NO
  immediately-following separator (or end of string).
- resolvesToRoot(id): a companion segment walk (same split-on-either-separator convention as
  escapesRoot) returning true when the net depth after processing every segment is 0. Clamped at 0
  internally (Math.max(0, depth-1)) so the function is correct standalone regardless of call order.

Both wired into assertConfinedToBundle (core/rewrite.ts, AC#1/AC#5 -- applies symmetrically to
BOTH fromId and toId) and assertDestinationConfined (commands/rename.ts, AC#2 -- newId only).

AC#7: 9 tests total (after the review round) -- 6 at the engine layer (drive-relative toId,
drive-relative fromId, empty toId, self-cancelling toId, self-cancelling fromId, plus a
false-positive check for a real cancel-through path) and 3 at the argument-parsing layer
(drive-relative/empty/self-cancelling newId). AC#6's existing "..foo/bar" false-positive test
(LCLI-79) continues to pass unchanged.

Live-CLI verification (per this campaign's standing discipline): real scratch bundle under
.repro-scratch/lore95-verify/, driving the actual `lore rename` CLI via `bun run src/cli.ts`.
Post-fix: all three shapes (C:pwned, empty string, sub/..) correctly refused at exit 2, source
file untouched, no docs/..md or docs/C:pwned.md ever created. Pre-fix (via `git stash` on the two
source files): both gaps reproduced for real -- "C:pwned" silently succeeded (exit 0, wrote
docs/C:pwned.md), and an empty newId silently succeeded (exit 0, wrote docs/..md with the moved
concept's exact content).

Independent review (general-purpose subagent, run after committing the fix+tests): no blocking
findings. Verified the fix independently -- reverted the two source files to pre-fix and reran
test/rename.test.ts, confirming all 7 originally-new "must reject" tests genuinely fail without the
fix (not vacuous), then restored and reran the full suite. Traced isDriveRelative/resolvesToRoot
against ~25 cases empirically, confirmed no false positives/negatives. Confirmed lore supersede is
unaffected (its own conceptNotInBundle precondition means a normalized id from an already-loaded
real concept can never hit these degenerate shapes). One non-blocking coverage gap noted: no
dedicated empty/self-cancelling-fromId test existed (only drive-relative-fromId did) -- closed by
adding one more engine-layer test proving resolvesToRoot applies symmetrically to fromId too via
the shared guard (a `validation` type, not `not_found`, is what proves the guard fired before any
concept lookup).

Verified (final): bun test -> 1680 pass/0 fail (up from 1671); bun run typecheck clean; bun run
lint clean on all changed files -- 4 pre-existing infos remain in unrelated files, untouched.
<!-- SECTION:NOTES:END -->
