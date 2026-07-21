---
id: LORE-95
title: >-
  escapesRoot / assertConfinedToBundle accepts uncaught edge-case ids: Windows
  drive-relative paths and empty/self-cancelling newId
status: To Do
assignee: []
created_date: '2026-07-21 18:52'
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

(1) Windows drive-relative ids: an id shaped like "C:foo" (a drive letter and colon with no following separator — real Windows "relative to that drive's current directory" syntax, distinct from an absolute "C:\\..." path) passes every check assertConfinedToBundle relies on: win32.isAbsolute("C:foo") is false (Node correctly implements this as non-absolute), posix.isAbsolute("C:foo") is false, and escapesRoot's segment walk sees one segment with no separator and no literal "..", so it accepts it. Verified directly via Node's own path.win32 module. No test anywhere in the repo covers this exact shape — LORE-72's own win32 test only covers the absolute form. Tracing the actual filesystem write (rename.ts's commitWrites -> fswrite.ts's moveFile, which always calls the platform-native path.join(docsRoot, plan.rename.to) before any OS call) shows the drive-relative segment gets embedded mid-path rather than handed to the OS in isolation, so real exploitability at the write layer on an actual Windows host is unconfirmed and likely narrower than a cross-drive escape — this cannot be verified further from a POSIX host.

(2) Empty or self-cancelling newId: escapesRoot tracks a directory-depth counter and only rejects a ".." segment seen at depth 0; an empty string or a self-cancelling relative path like "sub/.." both keep the counter at 0 throughout their walk, so escapesRoot returns false for both. idFromPath (posix.normalize) then folds either shape to ".", so rewriteInbound's toPath becomes the literal string "..md" — a hidden dotfile at the bundle root. Live-verified: `lore rename reference/orders ""` and `lore rename reference/orders "sub/.."` both exit 0, report a successful rename to docs/..md, and `lore check` afterward reports 0 errors/0 warnings — nothing downstream catches it either. By contrast, `lore new`'s resolveOutPath (the guard's own stated inspiration) explicitly rejects rel === "" with a usage error; escapesRoot never inherited that check when factored out in LORE-80. This is not a containment escape (the write always lands inside docs/), just a silent-surprise correctness gap: a scripted rename whose destination resolves to an empty string succeeds silently instead of failing loudly.

Both gaps sit in the same shared function and the same two guard call sites, so both should be closed together — the same 'close every layer' pattern this campaign already applied via LORE-78/79/80.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 rewriteInbound throws a validation LoreError when a fromId or toId is shaped like a Windows drive-relative reference (e.g. "C:foo", a drive letter/colon with no following separator) — the same rejection already given to an absolute path or a "../"-prefixed traversal.
- [ ] #2 lore rename's own argument-parsing guard (assertDestinationConfined) rejects the identical drive-relative newId shape with a usage error before any bundle load, keeping parity with rewriteInbound's engine-layer guard.
- [ ] #3 `lore rename <id> ""` is rejected with a clear error before any file is written or moved (no docs/..md appears, source file unchanged).
- [ ] #4 `lore rename <id> "sub/.."` (or any other newId that normalizes to the bundle root itself) is likewise rejected before any write.
- [ ] #5 The empty/self-cancelling rejection happens at the shared rewriteInbound engine layer (core/rewrite.ts), not only at rename.ts's own pre-check, so any other current or future caller of the shared engine gets the same protection.
- [ ] #6 A real rename whose destination segment merely starts with ".." (e.g. "..foo/bar") or that legitimately cancels through a real intermediate directory to a non-root destination continues to succeed unaffected (no false-positive regression).
- [ ] #7 Automated tests exercise all three previously-uncaught shapes (drive-relative "C:foo", empty string, and self-cancelling "sub/..") against escapesRoot/assertConfinedToBundle and/or lore rename end-to-end, and assert rejection at both the engine layer and rename's argument-parsing layer.
<!-- AC:END -->
