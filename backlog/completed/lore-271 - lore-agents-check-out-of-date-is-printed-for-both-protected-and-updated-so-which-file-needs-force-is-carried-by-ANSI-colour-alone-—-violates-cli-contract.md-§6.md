---
id: LORE-271
title: >-
  lore agents --check: 'out of date' is printed for both protected and updated,
  so which file needs --force is carried by ANSI colour alone — violates
  cli-contract.md §6
status: Done
assignee: []
created_date: '2026-07-26 12:56'
updated_date: '2026-07-27 04:05'
labels:
  - cli-ux
  - docs-drift
  - cmd-crud-a
dependencies: []
modified_files:
  - src/commands/agents.ts
  - test/agents.test.ts
  - docs/reference/cli-contract.md
  - CHANGELOG.md
priority: medium
type: bug
ordinal: 373000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
`lore agents --check` should convey which file needs `--force` in its **text**, not only in its colour — or `docs/reference/cli-contract.md` §6 should stop promising that it does.

## Observed
Found by the round-5 wave-1 **integration review** (the cross-task pass), not by either single-task reviewer — neither LORE-267 nor LORE-268 touched the contract doc, so neither had reason to open it.

`cli-contract.md` §6 (approx. lines 358-360, restated in the §8 quick-reference table approx. line 414) promises:

> "Color is purely cosmetic and **never load-bearing**: no status, severity, or result is conveyed by color alone, so a non-color or piped consumer loses no information."

After LORE-267 (Done), that is false for `lore agents --check`. `actionLabel` (`src/commands/agents.ts` approx. lines 201-206) collapses **every** non-`unchanged` action to the same literal `out of date`, while `bridgeActionColor` paints `protected` yellow and `updated` green. Rendered live on merged `dev` under a real pty:

```
  \x1b[33mout of date\x1b[0m .claude/skills/lore/SKILL.md   <- protected, needs --force
  \x1b[32mout of date\x1b[0m CLAUDE.md                      <- updated, plain re-run
```

Piped (`--plain` auto-selected) or pretty under `NO_COLOR`, both collapse to indistinguishable `out-of-date` lines. The trailer states that *a* hand-edited file needs `--force` but never names which. Only `--json` retains the per-file attribution.

## Why it matters
This is the **first** command in the codebase to break that invariant. Everywhere else colour is strictly redundant because the painted token is the status word itself (`check.ts` approx. line 1019, `validate.ts` approx. 249, `errors.ts` approx. 684). So a `NO_COLOR` or CI consumer of pretty output is now strictly worse off than a TTY user for the same command — precisely what §6 promises cannot happen. `cli-contract.md` is a published contract document, not commentary.

LORE-267's own CHANGELOG bullet compounds it: it asserts the colour split "match[es] which one needs `--force`" — i.e. affirms the colour carries meaning — while citing only §1.2 ("pretty is not a parsing target"), which is a weaker and different promise than §6's.

**Not a regression in LORE-267's fix** — the yellow/green split is correct and desirable, and `--check` was arguably worse before (both were green). The gap is that the *label* never distinguished them, which only became load-bearing once the colours diverged.

## Direction (decide in plan; the two options are not equivalent)
1. **Distinguish in text** (better: restores §6 and improves `--plain`/`NO_COLOR`) — e.g. `--check` renders `out of date (hand-edited)` for `protected`. But this changes `--plain` output, which `cli-contract.md` §1.3 treats as a **contract-level change**, so it needs the contract doc and a CHANGELOG entry updated in step.
2. **Carve out §6** — add an explicit exception naming this command. Cheaper, but weakens a promise the rest of the CLI actually keeps, and leaves the piped consumer no better off.

Prefer 1 unless there is a concrete reason not to; record the rationale either way.

## Refs
`docs/reference/cli-contract.md` (§6 approx. 358-360, §8 table approx. 414, §1.2, §1.3), `src/commands/agents.ts` (`actionLabel` approx. 201-206, `bridgeActionColor` approx. 217-235, `renderPretty` approx. 243), `test/agents.test.ts`, LORE-267 (Done — introduced the colour split), LORE-129 (Done — established the `protected` trailer is load-bearing), LORE-250 (Done — colour/TTY discipline).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Running 'lore agents --check' with one protected and one updated file distinguishes them in TEXT, in both --plain and pretty-with-NO_COLOR — or cli-contract.md §6 and its §8 table row carry an explicit, accurate carve-out naming this command
- [x] #2 The chosen option and its rationale are recorded, including why the other was rejected
- [x] #3 If the label changes: cli-contract.md is updated per §1.3's contract-change rule, a CHANGELOG [Unreleased] entry is added, and LORE-267's existing CHANGELOG bullet is reconciled so it no longer implies colour alone carries the --force signal
- [x] #4 A test pins the chosen behaviour for both actions in non-colour output, so the distinction cannot silently regress
- [x] #5 Colour is still suppressed on a non-TTY per LORE-250; --json output and all exit codes (including 6) are unchanged; full suite + lore check stay green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Chose distinct text labels because preserving the no-color information guarantee is stronger than documenting an exception. Verified plain and pretty with color disabled; JSON and exit behavior are unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Protected drift now renders as 'out-of-date-protected' in plain output and 'out of date (protected; needs --force)' in pretty output. Contract docs, changelog, and regression tests were updated.
<!-- SECTION:FINAL_SUMMARY:END -->
