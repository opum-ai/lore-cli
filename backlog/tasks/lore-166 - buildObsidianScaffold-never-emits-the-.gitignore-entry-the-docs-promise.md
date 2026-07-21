---
id: LORE-166
title: buildObsidianScaffold never emits the .gitignore entry the docs promise
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
`buildObsidianScaffold` (src/core/consumer-scaffold.ts:173-179) returns a `ConsumerScaffoldPlan` with only `docs/.obsidian/app.json` in `files` and no `.gitignore` entry anywhere in the plan; `OBSIDIAN_GUIDANCE_NOTES` also says nothing about `.gitignore`. But docs/reference/consumer-compatibility.md:129-134 still documents `lore scaffold obsidian` as writing both the `app.json` preset AND "A `.gitignore` entry for `docs/.obsidian/workspace*.json` and the cache (commit `app.json` only)". A consumer who runs `lore scaffold obsidian` and trusts the docs will get an undocumented gap: Obsidian's `workspace*.json`/cache files are left untracked-but-not-ignored in their project, and none of the prior LORE-55.x subtasks (rollback, stale docs wording, shared-mutable-array bug, preflight gap) added this gitignore-writing behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Either `buildObsidianScaffold` emits a `.gitignore` (or an append/merge into an existing one) covering `docs/.obsidian/workspace*.json` and the Obsidian cache, matching what consumer-compatibility.md §3.2 promises, OR consumer-compatibility.md §3.2 is corrected to state that `lore scaffold obsidian` only writes `app.json` and the consumer must add the ignore entry themselves.
- [ ] #2 test/consumer-scaffold.test.ts gains a case asserting the actual `files`/`notes` produced by `buildObsidianScaffold` for the chosen behavior (gitignore entry present, or note instructing the user to add it) so the code and the doc can never again silently diverge.
<!-- AC:END -->
