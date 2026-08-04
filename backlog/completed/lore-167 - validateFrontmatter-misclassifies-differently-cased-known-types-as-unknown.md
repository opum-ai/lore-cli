---
id: LORE-167
title: validateFrontmatter misclassifies differently-cased known types as unknown
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-23 04:10'
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
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`validateFrontmatter` (src/core/schema.ts:159-186) looks up `profile.types.get(type)` at line 164 using the value `requireType` returns, which is only trimmed, never case-canonicalized. The `types` Map is keyed by each type's canonical casing (e.g. `"Story"`), and only `canonicalType()` (schema.ts:100-103) consults the lowercase `byLowerName` map to fold casing — but `validateFrontmatter` never calls `canonicalType` before its lookup. As a result, a frontmatter block with `type: story` (or any other differently-cased spelling of a real profile type) falls into the `compiled === undefined` branch at line 165-170, is only warned as an "unknown type", and skips the type's actual schema validation entirely — silently letting malformed fields through for a type that should have been strictly checked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A frontmatter object with `type: story` (or another differently-cased spelling of a known profile type like `Story`) is validated against that type's real compiled schema in `validateFrontmatter`, not treated as an unknown producer-extension type.
- [x] #2 test/schema.test.ts gains a regression case asserting that a differently-cased known type both resolves to the type's schema (errors are thrown for a field mismatch) and does not emit an "unknown type" warning.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In validateFrontmatter (src/core/schema.ts), fold the type token through canonicalType(type, profile) before the profile.types.get() lookup, so a differently-cased spelling of a known type (e.g. 'story') resolves to its real CompiledType instead of falling into the unknown-type branch. Only the lookup key is folded; fm itself is never mutated (ADR-0011 byte-stable contract) -- mirrors the existing whitespace-padding precedent (fails the schema's z.literal(name) type check loudly rather than silently demoting to unknown). 2. Add a regression test to test/schema.test.ts asserting a differently-cased known type (type: story + a genuinely malformed tags field) resolves to Story's schema (error names Story + tags) and does NOT emit an 'unknown type' warning. 3. Run full bun test -- discovered the fix's correct behavior cascades into two shared test fixtures (test/graph.test.ts writeStandardBundle, test/context.test.ts writeChainBundle) that had a pre-existing casing typo 'type: Adr' in a file literally named adr/0001-x.md -- they were unknowingly relying on the exact bug being fixed to be treated as an unknown/unvalidated type. Corrected the typo to 'ADR' (the file's own naming makes clear this was meant to be a real ADR concept, not a deliberate unknown-type fixture) in both files plus one dependent assertion in context.test.ts. 4. Mutation-check the new test via git apply -R/apply (never stash). 5. Full bun test + bun run typecheck green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. See implementation notes + final summary for root cause, fix, mutation-check, and full verification (bun test: 1873/0, typecheck: exit 0).

Root cause: validateFrontmatter looked up profile.types.get(type) with only the trimmed (never case-folded) type token, so a differently-cased spelling of a known type (e.g. 'story') missed the Map (keyed by canonical casing 'Story') and fell into the unknown-type warn-only branch, skipping schema validation entirely.

Fix: fold the lookup key through canonicalType(type, profile) (src/core/schema.ts). fm itself is left untouched (never mutated) so the schema's existing z.literal(canonicalName) check on the 'type' field still runs against the raw value -- mirrors the codebase's existing, already-tested precedent for whitespace-padded types (schema.test.ts: 'classifies on its trimmed value and then fails the literal check loudly'). A differently-cased known type now correctly classifies against its real schema and either passes or throws a precise validation error naming the mismatch -- never silently treated as an unknown producer extension.

Mutation-check: reverted src/core/schema.ts via git diff + git apply -R (no stash, per campaign rules), reran bun test test/schema.test.ts -> new LORE-167 test failed exactly as expected ('expected validateFrontmatter to throw a validation LoreError, but it returned'). Reapplied the patch (git apply) -> 27/27 pass.

Side effect requiring 2 extra files (called out per campaign scope rules): fixing the lookup surfaced that test/graph.test.ts (writeStandardBundle) and test/context.test.ts (writeChainBundle) both had a pre-existing casing typo -- 'type: Adr' in a file path adr/0001-x.md -- silently exploiting this exact bug to pass as an unvalidated unknown type. Since loadBundle throws on any one malformed concept, this cascaded into 42 unrelated test failures (graph/context/subgraph suites) on the first full-suite run. Corrected to 'type: ADR' (the file's own path/naming makes the intent unambiguous -- a real ADR concept, not a deliberate unknown-type fixture) plus the one dependent assertion in context.test.ts (type + tokenEstimate string). Verified no other test in either file asserts 'unknown type' behavior via this fixture, and that ADR's compiled schema has zero required fields beyond the type literal (profile.ts: ADR entry has fields: {}), so no further fixture changes were needed.

Verification: bun test -> 1873 pass, 0 fail (up from 1831 pass / 42 fail before the fixture correction). bun run typecheck -> tsc --noEmit exit 0. bun run lint has pre-existing, unrelated failures (managed-block.ts style nits, validate.test.ts import order, one formatting nit at context.test.ts:138-142 outside my diff, confirmed via git diff) -- left untouched as out of scope.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed validateFrontmatter (src/core/schema.ts) to fold the type token through canonicalType() before the profile.types.get() lookup, so a differently-cased spelling of a known type (e.g. 'story') resolves to and is validated against its real compiled schema instead of silently falling into the unknown-type warn-only branch. fm is never mutated -- the schema's existing type-literal check still runs on the raw value, matching the codebase's established whitespace-padding precedent. Added a regression test (test/schema.test.ts) asserting a differently-cased known type classifies as that type (no 'unknown type' warning) and surfaces a real field-mismatch error. Mutation-checked via git apply -R/apply (no stash): new test fails on pre-fix code, passes post-fix. Fixing the lookup surfaced a pre-existing casing typo ('type: Adr' in adr/0001-x.md) in two shared test fixtures (test/graph.test.ts, test/context.test.ts) that were unknowingly exploiting this exact bug; corrected to 'ADR' plus one dependent assertion -- minimal, necessary, explicitly out-of-scope-but-required file touches. Verified: bun test -> 1873 pass, 0 fail; bun run typecheck -> exit 0 clean.
<!-- SECTION:FINAL_SUMMARY:END -->
