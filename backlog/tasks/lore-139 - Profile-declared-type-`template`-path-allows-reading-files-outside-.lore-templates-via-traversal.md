---
id: LORE-139
title: >-
  Profile-declared type `template` path allows reading files outside
  .lore/templates/ via traversal
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
profile.ts's type-table parser (profile.ts:404, `asString(table.template, ...)`) accepts any string for a type's `template` attribute with no path-traversal or confinement validation. commands/new.ts's confinement guard (`assertTemplateNameConfined`) and symlink check only apply to the `--template` CLI flag, not to a profile-declared `template` value, which is joined under `.lore/templates/` and read directly. This was empirically reproduced: a `.lore/profile.toml` type declaring `template = "../../../secret_outside/leak"` made `lore new` read and embed the literal contents of a file three directories above the repo root into the generated concept, with exit code 0 and no error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A profile.toml type whose `template` value contains a path-traversal segment (e.g. `../../../secret_outside/leak`) is rejected — either at profile load time or at `lore new` resolution time — with a clear error, instead of being read and embedded into the generated document.
- [ ] #2 A regression test (in test/profile.test.ts or test/new.test.ts) reproduces a profile-declared `template` value with `../` traversal and asserts `lore new` fails with an error rather than exiting 0 with content from outside `.lore/templates/`.
<!-- AC:END -->
