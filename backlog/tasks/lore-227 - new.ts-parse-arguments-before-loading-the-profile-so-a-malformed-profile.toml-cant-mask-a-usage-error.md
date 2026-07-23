---
id: LORE-227
title: >-
  new.ts: parse arguments before loading the profile so a malformed profile.toml
  can't mask a usage error
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-crud-a
  - codex-review-followup
  - cli-args
dependencies: []
priority: low
type: bug
ordinal: 329000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `lore new` should report an obvious argument error (missing type/title) even when `.lore/profile.toml` is malformed, matching every sibling mutation command.

**Live state:** In `runNew` (src/commands/new.ts:91-92) `loadProfile({ root: options.root })` runs on line 91, *before* `parseNewArgs(options.args)` on line 92. `loadProfile` throws a LoreError on a syntactically-broken profile (parseToml, src/core/profile.ts:267-274). So running `lore new` with no arguments in a repo whose `.lore/profile.toml` is malformed surfaces the profile-parse error and hides the intended `"lore new" needs a type` usage error (new.ts:234-235).

**Why it's a defect:** The sibling commands all validate their own arguments before any profile I/O — link.ts `prepare` (parseLinkArgs:597 → loadProfile:609), rename.ts (parseRenameArgs:124 → loadProfile:148), supersede.ts (parseSupersedeArgs:111 → loadProfile:124). `new` is the lone outlier, so an obvious usage mistake is reported as a config error. The reorder is safe: `parseNewArgs` needs no profile, and every consumer of the loaded profile (`canonicalType` at new.ts:93, `resolveTemplate`, `buildNewConcept`) runs after both statements.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster cmd-crud-a. Round-3 re-audit confirmed the defect is still live on dev.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `runNew` calls `parseNewArgs(options.args)` before `loadProfile(...)`; the loaded profile is still threaded to `canonicalType`, `resolveTemplate`, and `buildNewConcept` unchanged.
- [ ] #2 Running `lore new` with no positional arguments in a repo whose `.lore/profile.toml` is syntactically invalid exits 2 with the `usage`-type "`lore new` needs a type" error (not the TOML-parse error).
- [ ] #3 A regression test in the new.ts test file covers the malformed-profile + missing-args case and asserts the usage error / exit 2.
- [ ] #4 All existing new.ts behavior (valid runs, profile-declared types, template resolution) is unchanged and the full test suite passes.
<!-- AC:END -->
