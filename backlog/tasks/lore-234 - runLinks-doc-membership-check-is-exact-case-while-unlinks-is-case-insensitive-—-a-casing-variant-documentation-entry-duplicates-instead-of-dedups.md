---
id: LORE-234
title: >-
  runLink's doc-membership check is exact-case while unlink's is
  case-insensitive — a casing-variant documentation entry duplicates instead of
  dedups
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 runLink's doc-membership check (currently `!detail.documentation.includes(docPath)` at src/commands/link.ts:225) matches an existing documentation entry case-insensitively, consistent with hasLabel (link.ts:730), removeBackRefs's hadDoc (link.ts:383), and removeDoc (link.ts:744).
- [ ] #2 addDoc (src/commands/link.ts:735) does not append docPath when a case-insensitive variant already exists, so no duplicate documentation entry is produced — verified for BOTH branches: label-present and label-absent (a task missing the doc: label but already carrying a casing-variant doc entry must not gain a duplicate).
- [ ] #3 A test links a task whose Backlog `documentation` already contains a casing variant of the concept's doc path (once with the doc: label present, once absent) and asserts the resulting documentation array carries exactly one entry for that doc (no duplicate) and that runLink still succeeds.
- [ ] #4 Verify: bun test test/link.test.ts, bun run typecheck, and the full bun test suite all pass.
<!-- AC:END -->
