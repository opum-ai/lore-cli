---
id: LORE-237
title: >-
  Harden `validate` arg parser: reject `--strict=<value>`, repeated `--strict`,
  and repeated `--type`
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-meta-b
  - codex-review-followup
  - validate
  - cli-arg-parsing
dependencies: []
priority: low
type: bug
ordinal: 339000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `lore validate`'s option parser should reject the same malformed flag shapes its sibling read commands already reject, instead of silently swallowing them.

**Why:** In `parseValidateArgs` (src/commands/validate.ts:118-127) the `switch (name)` handles `case "strict"` (lines 122-123, `strict = true`) with no inline-value guard and no duplicate guard, and `case "type"` (lines 119-121, `type = takeValue()`) with no duplicate guard. Live behavior on `dev` (confirmed by running the CLI):
- `validate --strict=false docs/index.md` exits 0 — the `=false` is discarded and strict is still enabled, so `--strict=false` perversely turns strict mode ON (a genuine footgun, not just cosmetic).
- `validate --strict --strict` exits 0 (repeat silently ignored).
- `validate --type ADR --type Story` exits 0 with last-value-wins (silently filters on the last `--type`).

The sibling parsers already guard these: `graph.ts:126-133` throws "--dot takes no value" (inline value on a boolean flag) and "--dot given more than once" (repeat); `context.ts:115-116`/`123-124` throw "--max-tokens/--depth given more than once". Aligning `validate` closes the cross-command inconsistency and removes the `--strict=false` footgun. All three raise a `usage` LoreError (exit 2), the parser's existing error class.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity section, cluster cmd-meta-b. Original citation `validate.ts:104`; live defect at `validate.ts:118-127`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `lore validate --strict=<anything>` (e.g. `--strict=false`, `--strict=x`) raises a `usage` LoreError (exit 2) — a boolean flag takes no value — matching graph's `--dot takes no value` guard.
- [ ] #2 `lore validate --strict --strict` (repeated boolean flag) raises a `usage` LoreError (exit 2), matching graph's "--dot given more than once".
- [ ] #3 `lore validate --type ADR --type Story` (repeated value flag) raises a `usage` LoreError (exit 2) rather than silently applying last-value-wins, matching context's "--max-tokens given more than once".
- [ ] #4 Existing accepted behavior is preserved: a single `--strict`; a single `--type ADR` and the inline `--type=ADR`; `--type` / `--type=` with no value still a usage error; and `--` still ends option parsing so a following `--strict`/`--type` token is treated as a positional path.
- [ ] #5 test/validate.test.ts gains a case for each of the three new rejections (asserting `LoreError` of type `usage`), and the existing arg-parsing tests still pass; `bun test test/validate.test.ts` is green.
<!-- AC:END -->
