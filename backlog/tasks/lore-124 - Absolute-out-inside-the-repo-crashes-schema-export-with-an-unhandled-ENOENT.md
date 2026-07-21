---
id: LORE-124
title: Absolute --out inside the repo crashes schema export with an unhandled ENOENT
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
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
confineOutDir (src/commands/schema.ts:135-141) only checks whether the resolved path escapes the repo root; it never rejects an absolute --out value that happens to resolve inside the repo. Because runSchema then passes the raw absolute outArg (not the resolved absOutDir) into emitSchemaFiles, ensureDir(options.root, outArg) (line 106), and join(options.root, file.path), an absolute --out double-prefixes the root. Reproduced against current code: `lore schema export --out <absolute path equal to .lore/schemas>` does not throw from confineOutDir, but then crashes with an unhandled `ENOENT: no such file or directory, scandir '.../.lore/schemas'` thrown from pruneOrphans's readdirSync, because the bogus double-prefixed directory was created instead of the real one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running `lore schema export --out <absolute path>` (whether inside or outside the repo) either throws a clean usage LoreError naming the problem, or is resolved/normalized correctly so no double-prefixed directory is created and no unhandled ENOENT is thrown.
- [ ] #2 A regression test in test/schema.test.ts (or test/schema-export.test.ts) passes an absolute --out path resolving inside the repo and asserts the command exits cleanly (or with a usage error) rather than throwing an unhandled ENOENT.
<!-- AC:END -->
