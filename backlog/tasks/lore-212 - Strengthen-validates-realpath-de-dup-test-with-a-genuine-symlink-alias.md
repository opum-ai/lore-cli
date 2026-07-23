---
id: LORE-212
title: Strengthen validate's realpath de-dup test with a genuine symlink alias
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-meta-d
  - codex-review-followup
  - test-coverage
dependencies: []
priority: low
type: task
ordinal: 314000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** the `validate` realpath-dedup test genuinely exercises `canonicalIdentity`'s realpath fold, so a regression that degraded it would fail a test.

**Why:** the "realpath de-dup" test at `test/validate.test.ts:823` ("the same physical file named twice is validated once") passes the identical string `"docs/r.md"` twice. In `collectFiles` (`src/commands/validate.ts:157-166`) both spellings `resolve()` to the same absolute path, so the duplicate collapses even without `canonicalIdentity`'s realpath fold (`src/commands/discover.ts:56`, `realpathSync.native`). The test would still pass if `canonicalIdentity` were degraded to return its input unchanged, leaving validate's actual symlink/case-alias de-dup mechanism uncovered. No other test kills that mutant: `test/validate.test.ts:831` only asserts a symlink is *surfaced on stderr* during a directory walk, and `test/replace.test.ts:510` *skips* the symlink via `walkMarkdown` rather than folding it via `canonicalIdentity`.

**Live context:** de-dup key is computed at `src/commands/validate.ts:160` (`const identity = canonicalIdentity(absFile)`); the fold itself is `src/commands/discover.ts:56-62`. A directly-passed symlink alias exercises it because `expandTarget` (`validate.ts:180-196`) `statSync`-follows the link and expands it, then `canonicalIdentity` resolves it onto the target's realpath.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity findings, cluster cmd-meta-d.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `test/validate.test.ts` gains a POSIX-only case (guarded `test.skipIf(process.platform === "win32")`, matching the file's existing symlink-test convention) that writes a real concept file and a symlink alias pointing at it (e.g. `docs/real.md` and `docs/link.md -> docs/real.md`), runs `runValidate` with BOTH paths passed explicitly, and asserts the resulting `report.files` has length 1.
- [ ] #2 The new test is a true mutation-killer: it passes on current `dev` and would fail if `canonicalIdentity` in `src/commands/discover.ts` were changed to return its input unchanged (verify by a temporary local edit, then revert).
- [ ] #3 `bun test test/validate.test.ts` passes.
<!-- AC:END -->
