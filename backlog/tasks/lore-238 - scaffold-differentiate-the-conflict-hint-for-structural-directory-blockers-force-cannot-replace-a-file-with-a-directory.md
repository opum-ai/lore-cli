---
id: LORE-238
title: >-
  scaffold: differentiate the conflict hint for structural directory blockers
  (--force cannot replace a file with a directory)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 19:19'
labels:
  - cmd-meta-c
  - codex-review-followup
  - scaffold
dependencies: []
priority: low
type: bug
ordinal: 340000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Provenance:** Codex second-opinion review (backlog doc-2, low-severity section, line 433), cluster cmd-meta-c.

**Outcome wanted:** `lore scaffold`'s never-silent-clobber conflict error must give an accurate remedy for *structural directory blockers* — a plain (non-directory) file sitting where a planned scaffold directory must go — instead of the uniform hint it shows today, which wrongly tells the user `--force` will overwrite it.

**Why:** In `src/commands/scaffold.ts` (runScaffold, lines 111-126) the preflight builds `collisions = [...blockedDirs, ...existingFiles]` where `blockedDirs` (line 112-115, the `statSync(abs).isDirectory()` check at line 114) are non-directory entries occupying a planned directory path, and `existingFiles` (line 116) are planned files that already exist. All collisions then throw a single `conflict` LoreError with the hint `"pass --force to overwrite, or remove the existing file(s) first"` (lines 119-124).

For a plain *file* collision `--force` is a valid remedy. For a *structural dir-blocker* it is not: under `--force` the entire preflight is skipped and the run reaches `writeAllOrRollback` -> `ensureDir` (src/commands/fswrite.ts:118-125) -> `mkdirSync(dir, {recursive:true})`, which throws `EEXIST` on a plain file occupying the directory path; `ioError` maps that to a `conflict` (fswrite.ts:434). So following the `--force` hint on a dir-blocker just produces a second failure. Only the "remove the conflicting entry" remedy works there.

The current test suite locks in the misleading behavior: `test/consumer-scaffold.test.ts:444-455` ("pre-existing non-directory file occupying website/") and `test/consumer-scaffold.test.ts:587-602` ("occupying docs/") both assert `err.hint` contains `--force` for a pure dir-blocker collision — those assertions must be updated to the corrected, differentiated hint.

Low severity (a misleading hint that costs the user one extra failed attempt with a clear follow-up), self-contained, and cleanly testable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When a `lore scaffold <target>` run without `--force` is blocked ONLY by a structural directory blocker (a plain file occupying a planned directory, e.g. a file at `docs` for `obsidian`/`mkdocs` or at `website` for `docusaurus`), the `conflict` error's hint does NOT claim `--force` will overwrite it and instead directs the user to remove/rename the non-directory entry.
- [x] #2 When the collisions are ONLY pre-existing regular files at planned file paths, the hint still offers `--force` as a valid remedy (existing behavior preserved).
- [x] #3 When collisions include BOTH a structural dir-blocker and a pre-existing file, the hint accurately conveys both remedies (`--force` overwrites the existing files; the structural blocker must be removed/renamed).
- [x] #4 A test asserts that actually passing `--force` against a repo whose planned directory is occupied by a plain file still fails with a `conflict` (confirming `--force` cannot fix a structural blocker, which is the justification for the differentiated hint).
- [x] #5 The existing assertions in test/consumer-scaffold.test.ts (~line 452-453 and ~line 599-600) that currently require the `--force` substring in the hint for a pure dir-blocker collision are updated to match the corrected hint, and the full suite (`bun test test/consumer-scaffold.test.ts`) passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a private conflictHint(hasDirBlocker, hasFileCollision) helper in scaffold.ts computing a differentiated remedy string: dir-blocker-only -> remove/rename guidance, no --force claim; files-only -> unchanged --force hint; both -> conveys both remedies. 2. Wire runScaffold's preflight throw to call conflictHint(blockedDirs.length>0, existingFiles.length>0) instead of the uniform string literal. 3. Update the two locked-in test assertions (docusaurus 'website/' and obsidian 'docs/' dir-blocker-only cases) to assert the hint no longer contains --force and instead contains remove/rename guidance. 4. Add a new test per target style asserting --force against a dir-blocker-only repo still throws a conflict (proving --force cannot fix it). 5. Add a mkdocs-based both-case test (top-level mkdocs.yml pre-existing file + docs/ blocked by a plain file) asserting the hint conveys both remedies. 6. Verify: bun test test/consumer-scaffold.test.ts, full bun test, bun run typecheck, biome check on changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a private conflictHint(hasDirBlocker, hasFileCollision) helper in src/commands/scaffold.ts and wired runScaffold's preflight conflict throw to it. Dir-blocker-only hint: 'remove or rename the non-directory entry that is blocking the planned directory, then re-run' (no --force substring). Files-only hint: unchanged 'pass --force to overwrite, or remove the existing file(s) first'. Both-case hint: 'pass --force to overwrite the existing file(s); separately, remove or rename the non-directory entry blocking the planned directory (--force cannot fix that one)'.

Verification:
- bun test test/consumer-scaffold.test.ts -> 56 pass, 0 fail (was 54 tests before; added 3: docusaurus --force-vs-dir-blocker, obsidian --force-vs-dir-blocker, mkdocs both-case hint).
- Updated the two previously-locked assertions at the docusaurus 'website/' dir-blocker test and the obsidian 'docs/' dir-blocker test: now assert hint excludes '--force' and includes 'remove or rename' (AC#5).
- New AC#4 tests: passing --force against a repo where the planned directory (website/ or docs/) is occupied by a plain file still throws a conflict LoreError (err.type === 'conflict'), confirming --force cannot fix a structural blocker; file left untouched.
- New AC#3 test (mkdocs): pre-create top-level mkdocs.yml (existing file) AND docs (plain file blocking the planned directory) in the same run -> single conflict error whose hint contains BOTH '--force' and 'remove or rename'.
- AC#2 preserved: the mkdocs/docusaurus/obsidian files-only re-run-without-force tests (line ~167 mkdocs, ~342/571 etc.) still assert hint contains '--force' and were left unchanged/still pass.
- Full bun test (repo-wide): 1962 pass, 0 fail, across 47 files.
- bun run typecheck: tsc --noEmit clean, no errors.
- bunx biome check src/commands/scaffold.ts test/consumer-scaffold.test.ts: 'Checked 2 files in 12ms. No fixes applied.' (no new lint issues).
- Diff scope confirmed via git status --porcelain: only src/commands/scaffold.ts, test/consumer-scaffold.test.ts, and this task's own backlog/tasks/*.md changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Differentiated lore scaffold's never-silent-clobber conflict hint by collision kind. Added a private conflictHint(hasDirBlocker, hasFileCollision) helper in src/commands/scaffold.ts: a structural directory blocker (a plain file occupying a planned scaffold directory) now gets a remove/rename-only hint with no --force claim, since --force skips the preflight but still fails later at ensureDir's mkdirSync (EEXIST -> conflict); a files-only collision keeps the original --force hint; a mixed collision states both remedies. Updated the two previously-locked test assertions (docusaurus website/ and obsidian docs/ dir-blocker cases) to match, and added three new tests: --force still fails with conflict against a dir-blocker (docusaurus + obsidian), and a mixed dir-blocker+file-collision case (mkdocs) whose hint conveys both remedies. Verified: bun test test/consumer-scaffold.test.ts (56 pass/0 fail), full bun test (1962 pass/0 fail across 47 files), bun run typecheck (clean), bunx biome check on both changed files (no new issues). Diff scope limited to src/commands/scaffold.ts, test/consumer-scaffold.test.ts, and this task's backlog file.
<!-- SECTION:FINAL_SUMMARY:END -->
