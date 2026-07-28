---
id: LCLI-83
title: >-
  profile.toml field/type declarations silently ignore unknown or misspelled
  attribute keys
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
parseFieldSpec, parseTypes, and parseItems in profile.ts only read known attribute keys by name, with no unknown-key check. A typo like `require = true` (meant to be `required`) silently defaults required to false instead of erroring, so every concept validates clean even when missing that field. The documented forward-compatible unknown-key tolerance is explicitly scoped to only the top-level [profile] table, not nested field/type/item tables, so this silent tolerance is an unintended gap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An unrecognized key inside a [types.fields.*] (or equivalent type/item) table produces a validation error or warning at profile-load time, not silent tolerance
- [x] #2 A test covers a misspelled attribute key (e.g. require instead of required) and asserts profile loading now flags it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirmed root cause in src/core/profile.ts: parseFieldSpec (line ~435), parseTypes (line ~347/360), and parseItems (line ~477) each read a fixed set of known attribute keys off a parsed TOML/JSON table by name (table.required, table.kind, etc.) with no check for keys OUTSIDE that known set. A typo like require=true (meant required) is simply never read, silently leaving required at its false default -- the profile loads clean and every concept validates clean even when missing that field.
2. Re-verified the task's scoping claim against parseProfile's own docstring (line ~304-311): the documented forward-compatible unknown-key tolerance is explicitly scoped to 'unknown top-level/[profile] key' only -- confirmed accurate, so the fix must NOT touch top-level doc keys or the [profile] table (intentional tolerance), only the nested field-spec/type/items tables the task names.
3. Add a generic rejectUnknownKeys(table, allowed, where, source) helper (mirrors this file's existing asTable/asString/asBoolean/asEnum validator style, throws the same LoreError('validation', ...) shape) and call it in all 3 named functions against each table's fixed legal-key vocabulary: field spec {required, kind, enum, items, default}; a [[types]] table {name, fields, sections, template}; an items table {kind, enum}.
4. Add 3 tests reproducing each of the 3 call sites' exact repro shape (a misspelled field attribute, an unrecognized [[types]] table key, an unrecognized items table key), confirmed via git stash to silently succeed pre-fix (matching the task's own 'silently defaults... instead of erroring' framing) and correctly throw post-fix.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Re-verified the task's own scoping claim against parseProfile's docstring before implementing: the documented forward-compatible unknown-key tolerance is explicitly scoped to top-level/[profile] keys only (accurate) -- the fix deliberately leaves those untouched and targets only the 3 named functions' nested tables (field spec, [[types]] table, items table), each with a small fixed attribute vocabulary and no forward-compat need.

Fix: added a generic rejectUnknownKeys(table, allowed, where, source) helper mirroring this file's existing validator style (asTable/asString/asBoolean/asEnum), wired into parseFieldSpec (FIELD_SPEC_KEYS = required/kind/enum/items/default), parseTypes' per-type table (TYPE_TABLE_KEYS = name/fields/sections/template), and parseItems (ITEMS_TABLE_KEYS = kind/enum). An unrecognized key now throws a validation LoreError (exit 6) naming the exact bad key, consistent with every other structural-grammar check in this file (all fail-loud, none warn-only -- this module has no warning mechanism at all, unlike the command layer's WarningCollector).

Added 3 tests in test/profile.test.ts, one per call site, matching the existing expectValidation harness pattern. Confirmed via git stash that all 3 fixtures genuinely silently SUCCEED pre-fix (the call returns instead of throwing -- exactly the task's own 'silently defaults... instead of erroring' framing, not just a different unrelated error) and correctly throw post-fix with a message naming the exact unknown key.

End-to-end verified with the real CLI: a scratch .lore/profile.toml with base.fields.owner = { require = true } (the task's exact typo example) now makes 'lore new' fail at exit 6 with message '.lore/profile.toml: base.fields.owner has unrecognized key "require"' and a hint naming the correct legal keys.

Full bun test: 1510 pass/0 fail (up from 1507, all pre-existing profile tests -- including the default profile and the ECK 17-type reconciliation test -- still pass unaffected). bun run typecheck clean. bun run lint clean on changed files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a closed-vocabulary key check (rejectUnknownKeys) to profile.ts's parseFieldSpec, parseTypes, and parseItems -- an unrecognized attribute key inside a field spec ({ required = ... }), a [[types]] table, or an items table now throws a validation LoreError (exit 6) naming the exact bad key, instead of being silently ignored (e.g. require=true, a typo for required, previously left the field non-required with no warning). The documented forward-compatible tolerance for the top-level/[profile] table is untouched (re-verified against parseProfile's own docstring before implementing). Verified end-to-end through the real lore CLI with the task's exact typo example (exit 6, clear message). Added 3 tests, one per call site, confirmed via git stash to silently succeed pre-fix and correctly throw post-fix. Full bun test 1510/1510 pass (up from 1507), typecheck clean, lint clean, all pre-existing profile tests (default profile, ECK 17-type profile) unaffected.
<!-- SECTION:FINAL_SUMMARY:END -->
