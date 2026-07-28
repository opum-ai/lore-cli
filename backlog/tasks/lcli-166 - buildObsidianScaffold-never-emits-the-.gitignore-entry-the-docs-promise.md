---
id: LCLI-166
title: buildObsidianScaffold never emits the .gitignore entry the docs promise
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - core-scaffold-consumer
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`buildObsidianScaffold` (src/core/consumer-scaffold.ts:173-179) returns a `ConsumerScaffoldPlan` with only `docs/.obsidian/app.json` in `files` and no `.gitignore` entry anywhere in the plan; `OBSIDIAN_GUIDANCE_NOTES` also says nothing about `.gitignore`. But docs/reference/consumer-compatibility.md:129-134 still documents `lore scaffold obsidian` as writing both the `app.json` preset AND "A `.gitignore` entry for `docs/.obsidian/workspace*.json` and the cache (commit `app.json` only)". A consumer who runs `lore scaffold obsidian` and trusts the docs will get an undocumented gap: Obsidian's `workspace*.json`/cache files are left untracked-but-not-ignored in their project, and none of the prior LCLI-55.x subtasks (rollback, stale docs wording, shared-mutable-array bug, preflight gap) added this gitignore-writing behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Either `buildObsidianScaffold` emits a `.gitignore` (or an append/merge into an existing one) covering `docs/.obsidian/workspace*.json` and the Obsidian cache, matching what consumer-compatibility.md §3.2 promises, OR consumer-compatibility.md §3.2 is corrected to state that `lore scaffold obsidian` only writes `app.json` and the consumer must add the ignore entry themselves.
- [x] #2 test/consumer-scaffold.test.ts gains a case asserting the actual `files`/`notes` produced by `buildObsidianScaffold` for the chosen behavior (gitignore entry present, or note instructing the user to add it) so the code and the doc can never again silently diverge.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/consumer-scaffold.ts: add OBSIDIAN_GITIGNORE_REL_PATH = ${OBSIDIAN_DIR}/.gitignore and an obsidianGitignore() builder emitting a scoped, self-contained docs/.obsidian/.gitignore (exclude-all-except pattern: '*' then '!.gitignore' and '!app.json' negations) -- mirrors the exact pattern already hand-maintained in this repo's own root .gitignore for docs/.obsidian/ (per OBSIDIAN_APP_JSON_REL_PATH's existing JSDoc), and is a superset of consumer-compatibility.md section 3.2's literal promise (ignores workspace*.json and the cache, plus every other per-user Obsidian file). A scoped .gitignore inside docs/.obsidian/ needs no merge-with-existing-file logic, unlike appending to a root .gitignore, so it fits the ConsumerScaffoldFile create-fresh/--force model used by every other scaffolded file.
2. Wire the new file into buildObsidianScaffold's files array (after app.json), update its JSDoc plus the module docstring's single-exception sentence and OBSIDIAN_APP_JSON_REL_PATH's JSDoc to reflect two files now living under docs/.obsidian/.
3. test/consumer-scaffold.test.ts: update existing assertions that hardcode a single-file plan/output (dirs no longer needed but files list, 1-file count, plain-mode ordering, --force overwrite, never-silent-clobber before/after checks) to account for the new file, and add a new case asserting the .gitignore's exact path + contents (AC #2) so code and docs/reference/consumer-compatibility.md#3.2 can't silently diverge again.
4. Mutation-check the new/updated tests: revert the src change via git diff/apply (never stash), confirm the new gitignore-content test fails against pre-fix code, re-apply, confirm it passes.
5. Run bun test and bun run typecheck (full suite, both green). Check AC #1 and #2. Do not touch consumer-compatibility.md (doc's literal wording is a satisfied subset of the exclude-all-except pattern, not a contradiction) or any file outside src/core/consumer-scaffold.ts and test/consumer-scaffold.test.ts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented option 1 (code emits the gitignore) rather than the doc-correction alternative. buildObsidianScaffold now also writes docs/.obsidian/.gitignore (new OBSIDIAN_GITIGNORE_REL_PATH constant + obsidianGitignore() builder), an exclude-all-except pattern (* / !.gitignore / !app.json) scoped inside docs/.obsidian/ itself -- a strict superset of consumer-compatibility.md section 3.2's literal workspace*.json/cache wording, mirroring the pattern this repo's own root .gitignore hand-maintains for its own docs/.obsidian/. Scoping the ignore file inside docs/.obsidian/ (rather than appending to a possibly-pre-existing root .gitignore) avoids any merge-with-existing-content problem and fits the same create-fresh/--force-to-overwrite model every other scaffolded file already uses. Updated module docstring's single-exception sentence, OBSIDIAN_APP_JSON_REL_PATH's and buildObsidianScaffold's JSDoc, and every existing test that hardcoded a single-file plan/output (dirs, files list, 1-file count, plain-mode ordering, never-silent-clobber before/after, --force). Added a new pure-builder test asserting the gitignore's exact path + pattern lines (AC #2). Mutation-check: reverted src/core/consumer-scaffold.ts via git diff + git apply -R (no stash) -- the whole consumer-scaffold.test.ts file then failed to even load (SyntaxError: Export named 'OBSIDIAN_GITIGNORE_REL_PATH' not found), proving the new/updated tests depend on the fix; re-applied the patch and the suite passed again. Verification: bun test test/consumer-scaffold.test.ts -> 53 pass/0 fail; bun test (full suite) -> 1860 pass/0 fail; bun run typecheck -> clean; bun run lint -> clean on both touched files (2 pre-existing unrelated errors remain in test/validate.test.ts, untouched by this task). docs/reference/consumer-compatibility.md section 3.2 was deliberately left unedited -- its wording is a satisfied subset of the implemented exclude-all-except pattern, not a contradiction, and the task's edit target excludes it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
buildObsidianScaffold (src/core/consumer-scaffold.ts) now writes docs/.obsidian/.gitignore alongside app.json -- an exclude-all-except pattern (*, !.gitignore, !app.json) scoped inside docs/.obsidian/, a strict superset of consumer-compatibility.md section 3.2's promised workspace*.json/cache coverage. test/consumer-scaffold.test.ts updated throughout for the two-file plan/output and gained a new pure-builder case pinning the gitignore's exact contents (AC #2). Verified: bun test test/consumer-scaffold.test.ts (53 pass/0 fail), full bun test (1860 pass/0 fail), bun run typecheck (clean), bun run lint (clean on touched files). Mutation-check via git apply -R/apply on src/core/consumer-scaffold.ts (no stash): pre-fix code makes the whole test file fail to load (missing OBSIDIAN_GITIGNORE_REL_PATH export); post-fix it passes.
<!-- SECTION:FINAL_SUMMARY:END -->
