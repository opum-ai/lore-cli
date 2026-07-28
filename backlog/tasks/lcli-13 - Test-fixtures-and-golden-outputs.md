---
id: LCLI-13
title: Test fixtures and golden outputs
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - test
  - fixtures
milestone: m-1
dependencies: []
priority: medium
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A sample OKF bundle (valid + deliberately broken concepts) and recorded golden Backlog --json outputs; golden-file idempotency + JSON-contract test scaffolding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Fixture bundle exercises every known type
- [x] #2 Golden JSON-contract test runs against the fork output
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. AC#1 — sample OKF bundle fixture at test/fixtures/okf-bundle/: one CLEAN concept per known defaultProfile type (Epic/Story/Spec/ADR/Runbook/Reference, correct required sections + summary) plus a broken/ wing tripping one representative finding each (missing type, mistyped field, missing required-section = validate errors; missing summary, unknown type = warnings; dangling link = check broken-link error; Obsidian-isms = check portability warnings). test/okf-fixture.test.ts walks the bundle and drives the real validateConceptText + checkBundle engines; a coverage assertion pins the valid wing to defaultProfile().types (adding a type without a fixture fails).
2. AC#2 — golden JSON-contract test locked to docs/reference/backlog-json-schema.md. Captured REAL fork --json envelopes (task view LCLI-33, task list, search) via the fork CLI run directly (bun <fork>/src/cli.ts — no compiled binary needed; dodges the external-volume compile trap), redacting the only host-specific field (absolute filePath -> {REPO}) and trimming list/search to a small sample. test/support/backlog-golden.ts = shared canonicalize/redact + a Zod mirror of the §1-§5 contract; test/support/record-backlog-goldens.ts = the committed recorder (idempotency scaffolding). test/backlog-json-golden.test.ts validates each committed golden against the mirror (camelCase kind, string schemaVersion, rawContent/lastModified omitted, list fields arrays, filePathRelative portable) and asserts canonical-form fixpoint (re-canonicalize == byte-identical).
3. Gates: typecheck, biome, full bun test (all green), lore validate + lore check (fixtures under test/ are outside the docs/ bundle so not scanned).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered on feat/lore-13-golden-fixtures.

AC#1 (sample OKF bundle, every known type + broken concepts):
- test/fixtures/okf-bundle/ — 6 clean concepts (Epic/Story/Spec/ADR/Runbook/Reference; ADR carries Status/Context/Decision/Consequences, Story carries Acceptance criteria) + broken/ wing: missing-type, mistyped-field, missing-sections (validate errors), missing-summary, unknown-type (warnings), dangling-link (check broken-link error), non-portable (check portability warnings).
- test/okf-fixture.test.ts (11 tests): walks the bundle, drives real validateConceptText + checkBundle. Coverage assertion equals fixtureTypes to defaultProfile().types — a new type without a fixture fails. Also asserts the valid wing has zero broken-links and the only broken-link in the bundle is the intended one.

AC#2 (golden JSON-contract test against real fork output, locked to backlog-json-schema.md):
- Captured REAL fork --json (fork branch tasks/back-510-json-output @ a80b7a1) by running bun <fork>/src/cli.ts directly against this repo's backlog project — NO compiled binary needed, so the external-volume --compile trap is irrelevant to recording.
- test/fixtures/backlog-json/{task,task-list,search-result}.json — one envelope per kind; task = LCLI-33 (rich: plan/notes/ACs/deps/docs; null finalSummary/source/branch exercise nullables; portable prose, unlike LCLI-4 whose notes carry absolute paths). Absolute filePath redacted to {REPO}; list/search trimmed to 3 entries.
- test/support/backlog-golden.ts — shared canonicalize (2-space + trailing newline) + deep repo-root redaction + a Zod mirror of the §1-§5 contract (EnvelopeSchema discriminated on camelCase kind; TaskSchema/TaskSummarySchema/SearchHitSchema, looseObject for §2 additive tolerance). Note: this mirror is test-only and should be retargeted to import LCLI-21's src adapter schema once that lands.
- test/support/record-backlog-goldens.ts — the committed recorder (idempotency scaffolding). Re-record verified BYTE-IDENTICAL (md5 stable across two runs).
- test/backlog-json-golden.test.ts (25 tests): each golden validates against the mirror; §2/§6 caveats asserted on the real bytes (schemaVersion string '1', camelCase kind guards the doc-slip 'task-list', rawContent+lastModified omitted, list fields arrays, filePathRelative repo-relative); canonical-form fixpoint (recanonicalize == byte-identical); + discrimination tests (rejects hyphen kind / numeric or bumped schemaVersion / missing required key, tolerates additive keys).

Gates: bun run typecheck 0 errors; biome clean; bun test 1026 pass / 0 fail (was 990; +36); lore validate 0 errors (16 pre-existing docs warnings, unrelated); lore check 0 errors / 0 warnings. Fixtures live under test/ (outside the docs/ bundle root) so lore validate/check never scan them.

CHANGELOG: intentionally no entry — LCLI-13 is test-only infrastructure with no user-facing command/flag/output change (existing CHANGELOG entries are all user-facing features).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the LCLI-13 test fixtures + golden-output harness. AC#1: a real, walkable sample OKF bundle (test/fixtures/okf-bundle/) with one clean concept per known type plus a broken/ wing that trips representative validate/check findings; test/okf-fixture.test.ts drives the real engines and pins type coverage to the built-in profile. AC#2: committed golden Backlog.md --json envelopes (one per kind) captured from the real fork CLI, locked to docs/reference/backlog-json-schema.md by a Zod contract mirror and a byte-identical canonical-form fixpoint, with a committed recorder as the regeneration path. typecheck+biome+1026 tests green; lore validate/check clean. Shipped as a PR into dev (awaiting user review/merge).
<!-- SECTION:FINAL_SUMMARY:END -->
