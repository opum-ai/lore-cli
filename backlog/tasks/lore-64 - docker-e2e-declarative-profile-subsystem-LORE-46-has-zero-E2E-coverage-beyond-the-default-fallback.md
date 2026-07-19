---
id: LORE-64
title: >-
  docker/e2e: declarative profile subsystem (LORE-46) has zero E2E coverage
  beyond the default fallback
status: To Do
assignee: []
created_date: '2026-07-19 22:59'
labels:
  - e2e
  - testing
  - profile
dependencies:
  - LORE-56
  - LORE-46
references:
  - docker/e2e/run-e2e.sh
  - src/core/profile.ts
priority: high
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A multi-agent coverage audit of docker/e2e (2026-07-19, dev @ b8a4667; adversarially verified) found the declarative profile subsystem (LORE-46) — a whole shipped feature, the ADR-0006-amended type system, and ECK's declared integration seam — is exercised only through its zero-config default fallback. Every populated-profile behavior has zero E2E coverage:

- `lore new <CustomType>` with a custom `.lore/templates/<slug>.md` template (template lookup by slug touches the real filesystem — exactly where E2E adds value over unit tests)
- Profile-declared field kinds/enums/required sections failing validate/check at exit 6 (the generated Zod validators)
- `lore schema export` emitting custom-slug schemas (and dropping built-ins under a replacing profile)
- Case-insensitive type resolution + did-you-mean suggestions
- The no-types fail-loud path (src/core/profile.ts:335-342)
- The `.json` lower-precedence profile form
- A malformed profile turning all loadProfile-bearing commands into validation exit 6

The zero-config fallback IS covered by every invocation after phase 1 — but that is the only profile path that runs.

The audit proposed a dedicated new phase (write a .lore/profile.toml declaring a custom type + template, create/validate/schema-export against it, then a malformed-profile fail-loud case) — re-derive the exact TOML keys from the LORE-46 profile reference docs at execution time rather than trusting this description.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A populated .lore/profile.toml with a custom type and custom template is exercised E2E: lore new CustomType succeeds and writes from the custom template
- [ ] #2 A profile-declared required field, when missing from a doc, fails lore validate at exit 6
- [ ] #3 lore schema export emits the custom-slug schema file
- [ ] #4 A malformed profile makes loadProfile-bearing commands fail loud at exit 6
- [ ] #5 The full harness runs green against the real pinned upstream binary, and teardown is clean
<!-- AC:END -->
