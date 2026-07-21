---
id: LORE-123
title: schema export follows a symlink planted at a schema file's leaf path
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-meta-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
confineOutDir (src/commands/schema.ts) only lexically confines the --out directory; LORE-93/94 already closed the ancestor-directory-symlink escape for both the write and prune paths. However the per-file write loop in runSchema (schema.ts:107-111) calls writeFileOverwriting(join(options.root, file.path), ...) with no leaf-level symlink check on file.path itself. Reproduced against current code: planting a symlink at .lore/schemas/story.schema.json pointing to a file outside the repo, then running `lore schema export`, silently overwrites the outside file's contents through the symlink with no error, because plain writeFileSync follows a leaf symlink.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running `lore schema export` when a target schema file path (e.g. .lore/schemas/story.schema.json) is a symlink pointing outside the repo root fails with a denied/usage error instead of writing through the symlink.
- [ ] #2 A regression test in test/schema-export.test.ts (or test/schema.test.ts) plants a leaf symlink at a schema output path pointing to an external file and asserts the export does not modify the external file's contents.
<!-- AC:END -->
