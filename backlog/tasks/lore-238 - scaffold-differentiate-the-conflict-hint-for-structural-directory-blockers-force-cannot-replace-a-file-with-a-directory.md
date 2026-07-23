---
id: LORE-238
title: >-
  scaffold: differentiate the conflict hint for structural directory blockers
  (--force cannot replace a file with a directory)
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 When a `lore scaffold <target>` run without `--force` is blocked ONLY by a structural directory blocker (a plain file occupying a planned directory, e.g. a file at `docs` for `obsidian`/`mkdocs` or at `website` for `docusaurus`), the `conflict` error's hint does NOT claim `--force` will overwrite it and instead directs the user to remove/rename the non-directory entry.
- [ ] #2 When the collisions are ONLY pre-existing regular files at planned file paths, the hint still offers `--force` as a valid remedy (existing behavior preserved).
- [ ] #3 When collisions include BOTH a structural dir-blocker and a pre-existing file, the hint accurately conveys both remedies (`--force` overwrites the existing files; the structural blocker must be removed/renamed).
- [ ] #4 A test asserts that actually passing `--force` against a repo whose planned directory is occupied by a plain file still fails with a `conflict` (confirming `--force` cannot fix a structural blocker, which is the justification for the differentiated hint).
- [ ] #5 The existing assertions in test/consumer-scaffold.test.ts (~line 452-453 and ~line 599-600) that currently require the `--force` substring in the hint for a pure dir-blocker collision are updated to match the corrected hint, and the full suite (`bun test test/consumer-scaffold.test.ts`) passes.
<!-- AC:END -->
