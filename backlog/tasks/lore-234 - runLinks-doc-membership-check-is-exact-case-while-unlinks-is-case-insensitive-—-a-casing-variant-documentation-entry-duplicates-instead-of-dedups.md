---
id: LORE-234
title: >-
  runLink's doc-membership check is exact-case while unlink's is
  case-insensitive — a casing-variant documentation entry duplicates instead of
  dedups
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 19:56'
labels:
  - cmd-link
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 336000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `lore link` should recognize an existing Backlog `documentation:` entry that differs from the concept's doc path only by case, instead of appending a second, casing-variant duplicate.

**Live locations:**
- `src/commands/link.ts:225` — `const docChanged = !detail.documentation.includes(docPath);` (exact-case).
- `src/commands/link.ts:735` — `addDoc`: `return existing.includes(docPath) ? [...existing] : [...existing, docPath];` (exact-case).

Both are exact-case, whereas the sibling membership checks are case-insensitive: `hasLabel` (link.ts:730 → `containsCaseInsensitive`), `removeBackRefs`'s `hadDoc` (link.ts:383 → `containsCaseInsensitive`), and `removeDoc` (link.ts:744 → case-insensitive filter). unlink's whole doc path is therefore case-insensitive; link's is not.

**Failure path:** for a task whose `documentation:` already contains a casing variant of `docPath` (e.g. `docs/Stories/X.md` vs the computed `docs/stories/x.md`), if the `doc:` label is absent then `wasPresent && !docChanged` is false (link.ts:226), so runLink falls through to `desiredDocs = addDoc(detail.documentation, docPath)` (link.ts:240) which, being exact-case, appends a second entry → the task ends up with two documentation entries for the same doc. (When the label IS present, exact-case `docChanged` also spuriously flips to true, forcing an unnecessary edit + duplicate.)

**Why (provenance):** doc-2 (Codex second-opinion review) low-severity finding, cmd-link cluster. The fix aligns link's doc membership with the case-insensitive convention already used everywhere else in this file, mirroring `removeDoc`/`hadDoc`; the safety rationale for case-insensitive doc matching (assertNoLabelCaseCollision rules out a colliding concept up front) is documented at link.ts:378-383.

**Related sibling (may fold in or defer):** `moveBackRefs` (link.ts:496) filters `d !== oldDocPath` and tests `!docs.includes(newDocPath)` exact-case on the rename path — the same exact-case family, but a separate site; may be addressed here or left for its own follow-up.

Low priority: a casing variant only arises from hand-edits or an out-of-band move; the impact is a cosmetic duplicate documentation entry, not data loss.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 runLink's doc-membership check (currently `!detail.documentation.includes(docPath)` at src/commands/link.ts:225) matches an existing documentation entry case-insensitively, consistent with hasLabel (link.ts:730), removeBackRefs's hadDoc (link.ts:383), and removeDoc (link.ts:744).
- [x] #2 addDoc (src/commands/link.ts:735) does not append docPath when a case-insensitive variant already exists, so no duplicate documentation entry is produced — verified for BOTH branches: label-present and label-absent (a task missing the doc: label but already carrying a casing-variant doc entry must not gain a duplicate).
- [x] #3 A test links a task whose Backlog `documentation` already contains a casing variant of the concept's doc path (once with the doc: label present, once absent) and asserts the resulting documentation array carries exactly one entry for that doc (no duplicate) and that runLink still succeeds.
- [x] #4 Verify: bun test test/link.test.ts, bun run typecheck, and the full bun test suite all pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fix runLink's docChanged (link.ts) to use containsCaseInsensitive instead of exact-case includes(). 2. Fix addDoc to use containsCaseInsensitive instead of exact-case includes(). 3. Add test(s) in test/link.test.ts covering: (a) doc: label absent + documentation already has a casing-variant doc path -> no duplicate added, runLink succeeds; (b) doc: label present + documentation already has a casing-variant doc path -> no duplicate, no unnecessary edit forced. 4. Verify a genuinely new doc path (no case variant) is still appended (regression). 5. Run bun test test/link.test.ts, bun run typecheck, full bun test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed docChanged (link.ts runLink) and addDoc to use the existing containsCaseInsensitive predicate instead of exact-case includes(), matching hasLabel/hadDoc/removeDoc conventions. Left moveBackRefs (rename path, line ~496) untouched per task guidance — separate site, out of scope. Added 2 tests: label-present + casing-variant doc (no edit, no duplicate), label-absent + casing-variant doc (label repaired, doc stays single entry, no duplicate). Verified: bun test test/link.test.ts = 71 pass/0 fail; bun run typecheck clean; full bun test = 1974 pass/0 fail across 47 files; bunx biome check src/commands/link.ts test/link.test.ts = no issues. Existing test 'preserves an existing unrelated documentation entry' already proves a genuinely-new (non-case-variant) doc path is still appended.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made runLink's docChanged and addDoc case-insensitive (containsCaseInsensitive), aligning them with hasLabel/hadDoc/removeDoc. A casing-variant Backlog documentation: entry is now recognized instead of gaining a duplicate, in both the doc:-label-present and label-absent branches. Verified with 2 new tests in test/link.test.ts plus full bun test (1974 pass/0 fail) and clean bun run typecheck. moveBackRefs (rename path) intentionally left out of scope per task guidance.
<!-- SECTION:FINAL_SUMMARY:END -->
