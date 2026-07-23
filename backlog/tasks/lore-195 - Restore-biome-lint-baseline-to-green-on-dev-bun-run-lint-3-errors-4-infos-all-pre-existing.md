---
id: LORE-195
title: >-
  Restore biome lint baseline to green on dev (bun run lint: 3 errors + 4 infos,
  all pre-existing)
status: To Do
assignee: []
created_date: '2026-07-23 14:08'
labels:
  - hygiene
  - lint
  - biome
  - tooling
dependencies: []
priority: low
type: chore
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Restore `bun run lint` to a clean, green baseline on the `dev` branch — exit 0 with **0 errors and 0 infos** — without changing any runtime behavior. `bun run lint` runs `biome check .` (Biome 2.4.12; config in `biome.json`) and currently exits 1.

## Why it matters
Throughout the codex-review backlog campaign, merges were gated on `bun test` + `bun run typecheck` only — never `bun run lint`. As a result the Biome baseline drifted RED and stayed there. Every current finding sits in files that no campaign task modified (pre-existing), so this is pure hygiene: getting lint back to green makes it a trustworthy signal again and is a prerequisite to ever re-adding lint as a CI/merge gate.

## Current findings (captured on `dev` @ 65b7ef6 via `bun run lint`)
`Checked 108 files … Found 3 errors. Found 4 infos.` The 3 errors drive the non-zero exit; the 4 infos are `useTemplate` suggestions Biome does not fail on, but the "0 infos" goal still requires resolving them.

**Errors** (Biome-classified *safe* fixes — `biome check --write` / `bun run lint:fix` handles these; import reorder + whitespace reflow, behavior-neutral):
- `test/context.test.ts` (~lines 140–142) — formatter: a multi-line `expect(ref?.tokenEstimate).toBe( … )` fits within the configured 120-col width and Biome would collapse it onto one line.
- `test/replace.test.ts:1` — `assist/source/organizeImports`: named imports not sorted (`MANAGED_REGION_LOCATORS` / `managedRanges`).
- `test/validate.test.ts:1` — `assist/source/organizeImports`: named imports not sorted (`PROFILE_REL_PATH` / `parseProfile`).

**Infos** — all `lint/style/useTemplate`. Biome classifies each as an **Unsafe** fix, so plain `biome check --write` will NOT touch them; they need `--unsafe`, a manual template-literal rewrite, or a justified `// biome-ignore lint/style/useTemplate: <reason>`. Each is a plain string-concatenation whose operands are all strings, so a template-literal form emits byte-identical output:
- `src/core/managed-block.ts:187` — `return content.slice(0, begin.end) + ` + "`\\n${table}\\n`" + ` + content.slice(end.start);`
- `src/core/managed-block.ts:428` — `const updated = content.slice(0, located.begin.end) + ` + "`\\n${body}\\n`" + ` + content.slice(located.end.start);`
- `test/managed-block.test.ts:216` — `"```markdown\\n" + ` + "`${TASK_BLOCK_BEGIN}\\n…\\n${TASK_BLOCK_END}\\n`" + ` + "```"`
- `test/supersede.test.ts:85` — `"---\\ntype: ADR\\ntitle: Old\\n---\\n" + body`

Caution: the two `managed-block.ts` occurrences live inside the managed-block string-splice engine whose output is asserted byte-for-byte by fixpoint tests in `test/managed-block.test.ts` — re-run the full suite after any edit there.

Note: applying only the safe autofixes (default `bun run lint:fix`) makes `bun run lint` **exit 0 but still print the 4 infos**; reaching "0 infos" additionally requires resolving the four `useTemplate` findings.

## Scope / non-goals
- Behavior-preserving only. Do **not** disable or relax any rule in `biome.json` to hide a finding — green must come from clean code, not a silenced rule.
- Config: `biome.json` (Biome 2.4.12) — `recommended` + style overrides, `assist.actions.source.organizeImports: on`, formatter `lineWidth: 120`, double quotes.
- Scripts (`package.json`): `lint` → `biome check .`; `lint:fix` → `biome check --write .`; `format` → `biome format --write .`.

## Baseline to preserve (measured at spec time on `dev` @ 65b7ef6)
- `bun run lint`: exit 1 — 3 errors, 4 infos (above).
- `bun test`: **1913 pass / 0 fail** across 47 files.
- `bun run typecheck` (`tsc --noEmit`): exit 0, clean.

## No duplicate
`backlog search "lint"` returns only Done tasks about lore's own `check` command and CI harness (LORE-7/8/30, …); `backlog task list --type chore` returns only LORE-55.7/8/9 (Done, unrelated). No open task tracks this baseline.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `bun run lint` (which runs `biome check .`) exits 0 on the `dev` branch, and its final summary reports 0 errors and 0 infos (the 3 current errors and 4 current infos are all resolved).
- [ ] #2 The three error findings are gone: `test/context.test.ts` formatter reflow (~line 140), and the `assist/source/organizeImports` findings at `test/replace.test.ts:1` and `test/validate.test.ts:1`.
- [ ] #3 The four `lint/style/useTemplate` info findings are gone: `src/core/managed-block.ts:187`, `src/core/managed-block.ts:428`, `test/managed-block.test.ts:216`, and `test/supersede.test.ts:85` — each resolved either by a byte-identical template-literal rewrite or a justified `// biome-ignore lint/style/useTemplate: <reason>` comment.
- [ ] #4 `bun test` full suite still passes with 0 failures (baseline at spec time: 1913 pass / 0 fail across 47 files); the managed-block fixpoint assertions in `test/managed-block.test.ts` in particular still pass.
- [ ] #5 `bun run typecheck` (`tsc --noEmit`) still exits 0 with no errors.
- [ ] #6 No runtime/behavioral or public-surface change: edits are limited to import ordering, whitespace/formatting, and string-concatenation-to-template-literal conversions that produce byte-identical output (plus any justified `biome-ignore` comments); no function's observable behavior or exported signature changes.
- [ ] #7 No rule in `biome.json` was disabled, downgraded, or scoped away to mask a finding — the green result comes from cleaned code / justified per-line ignores only.
<!-- AC:END -->
