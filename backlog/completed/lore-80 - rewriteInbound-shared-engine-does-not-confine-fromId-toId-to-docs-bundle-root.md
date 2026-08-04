---
id: LORE-80
title: rewriteInbound shared engine does not confine fromId/toId to docs/ bundle root
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 15:40'
labels:
  - codex-review
  - security
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
core/rewrite.ts rewriteInbound (the shared engine behind both rename and supersede) never confines fromId/toId to the docs/ bundle root, and idFromPath performs no containment check either. This is the deepest layer of the same rename-destination-traversal gap found independently at the args.ts and rename.ts layers in this review; fixing containment here would close the gap for every caller of the shared engine at once, including supersede.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 rewriteInbound rejects (or callers are required to pre-validate) a fromId/toId that resolves outside the docs/ bundle root
- [x] #2 A test covers rewriteInbound called directly with a traversal toId and asserts it is rejected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a shared containment check inside rewriteInbound (core/rewrite.ts), the
   layer both `lore rename` (move mode) and `lore supersede --rewrite-links`
   (place-only mode) funnel through, rather than modifying idFromPath itself
   (which is also used by several read-only lookup commands out of scope here).
2. Compute from/to via idFromPath as today, then assert neither escapes the
   docs/ bundle root: reject a normalized id equal to ".." or starting with
   "../", or absolute per posix.isAbsolute/win32.isAbsolute (cross-platform,
   mirrors new.ts's resolveOutPath/assertTemplateNameConfined pattern) - throw
   a "validation" LoreError before any graph lookup or write is attempted.
3. Verify live pre-fix: `lore rename reference/orders ../pwned` against a
   scratch repo writes pwned.md/index.md OUTSIDE docs/ (confirmed exit 0).
   Verify live post-fix: same command + an absolute-path variant both now
   exit 6 with a clear error; a legitimate in-bundle rename still succeeds.
4. Add unit tests in test/rename.test.ts's "rewriteInbound - modes and
   validation" block calling rewriteInbound directly with a traversal toId,
   an absolute toId, and a traversal fromId (AC#2 requires at least toId).
5. Run full test suite, typecheck, and lint on the changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented assertConfinedToBundle in core/rewrite.ts, called on both from/to
inside rewriteInbound right after idFromPath, before any graph lookup or
write. Rejects an id equal to ".." or starting with "../" (post idFromPath's
own posix.normalize), or absolute per posix.isAbsolute/win32.isAbsolute
(cross-platform, mirrors new.ts's resolveOutPath/assertTemplateNameConfined).
Scoped to rewriteInbound rather than idFromPath itself, since idFromPath is
also called by several read-only lookup commands (context/tasks/graph/link)
outside this task's scope, where a traversal id just fails to match any real
concept (harmless) - not touching that broader surface.

Live verification (scratch git repo, bun run <abs-path-to-cli.ts>, no --cwd):
- Pre-fix: `lore rename reference/orders ../pwned` wrote pwned.md and
  index.md OUTSIDE docs/ at the repo root, exit 0 - confirmed the reported
  escape.
- Post-fix: same command now exits 6 with "toId \"../pwned\" resolves
  outside the docs/ bundle root"; an absolute toId (/tmp/lore80-abs) also
  exits 6; a legitimate in-bundle rename (reference/orders ->
  reference/sales-orders) still succeeds exit 0, 3 files changed.
- Real repo's own git status verified clean (only intended files) after
  every scratch-repo step, per this campaign's standing --cwd trap
  discipline.

Automated verification:
- bun test: 1647 pass, 0 fail (45 files), including 3 new rewriteInbound
  tests (traversal toId, absolute toId, traversal fromId), each asserting
  err.type === "validation".
- bunx tsc --noEmit: clean.
- bunx biome check src/core/rewrite.ts test/rename.test.ts: no issues (repo-
  wide `bun run lint` shows 4 pre-existing findings in unrelated test files,
  not touched by this change).

Independent review pending (lifecycle step 6) before Done/tracker write.

Independent review (general-purpose subagent, adversarial pass on the branch
diff) found one real, confirmed bypass in the first fix attempt: a relative
traversal spelled with backslashes (e.g. "..\pwned") tripped NEITHER check --
posix.normalize treats "\" as a literal character (not a separator), so
idFromPath left it unchanged, and win32.isAbsolute("..\\pwned") is false
(that string is relative, not absolute -- the check only matches drive-
letter/UNC/leading-separator absolute forms). Verified independently via a
direct Node script (posix.normalize/win32.isAbsolute/win32.join), matching
the reviewer's trace exactly. Since this project ships a compiled Windows
binary (.github/workflows/release.yml) and commands/rename.ts writes via the
platform-native path.join (which treats "\" as a separator on Windows), this
reproduced the same escape class the task set out to close, just spelled
with backslashes.

Fix revised: assertConfinedToBundle now runs on the RAW fromId/toId (before
idFromPath), and relative-escape detection is done by a new separator-
agnostic escapesRoot() that splits on either "/" or "\" and tracks directory
depth, rather than relying on posix.normalize/win32.isAbsolute's differing,
incomplete semantics. Absolute-path rejection (posix.isAbsolute/
win32.isAbsolute) is unchanged.

Re-verified after the revision:
- bun test test/rename.test.ts test/supersede.test.ts: 109 pass, 0 fail
  (6 LORE-80 tests total: traversal toId, absolute toId, backslash toId,
  mixed-separator toId, traversal fromId, and a no-false-positive case for
  a real "..foo/bar"-style segment).
- bun test (full suite): 1650 pass, 0 fail, 45 files.
- bunx tsc --noEmit: clean. bunx biome check on changed files: no issues.
- Live re-repro (fresh scratch repo): `lore rename reference/orders
  '..\pwned'` now exits 6 with the validation error, no file written outside
  docs/; a legitimate rename (reference/orders -> reference/sales-orders)
  still exits 0, 3 files changed. Real repo's own git status verified clean
  after every scratch step.

Everything else in the review came back clean: check runs before any graph
lookup or write for both callers (rename.ts move:true, supersede.ts
move:false); no over-rejection of a real "..foo/bar"-style segment; NUL
bytes don't bypass the string checks; "validation" -> exit 6 with no
collision with existing not_found/conflict paths; the internal
idFromPath(posix.join(...)) call at rewrite.ts:370 only feeds substituted
markdown text (never an fs write path) and is correctly out of scope.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Confined rewriteInbound's fromId/toId to the docs/ bundle root, closing the
shared-engine layer of the rename-destination-traversal gap (rename is the
exploitable caller; supersede's toId must already name a real graph concept,
which is already implicitly confined). An adversarial independent review
caught a real gap in the first attempt (a backslash-spelled relative
traversal bypassed both the posix-only "../" check and win32.isAbsolute,
since that string is relative not absolute) -- fixed with a separator-
agnostic segment walk (escapesRoot) checked on the raw caller-supplied id
before any processing. Verified live against a scratch repo both before
(escaped) and after (rejected, exit 6) the fix, plus 1650/1650 passing tests
(6 new), clean typecheck, and clean lint on the changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
