---
id: LORE-223
title: >-
  cli.ts: rejectStrayCommandFlags/rejectCommandArgs re-scan post-`--` tokens as
  flags
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 18:08'
labels:
  - cli-entry-state
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 325000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The hand-rolled arg parser documents (src/cli.ts:78) that "Tokens after a `--` are never re-interpreted as flags", but two validation helpers violate that contract by scanning for a leading `-` without honoring the `--` terminator.

- `rejectStrayCommandFlags` (src/cli.ts:350-357) runs `commandArgs.find((token) => token.startsWith("-") && token !== "-" && token !== "--")` over every token. It is invoked on the version/help/no-command short-circuit (src/cli.ts:178 and 192).
- `rejectCommandArgs` (src/cli.ts:365-382) strips `--` tokens, then flags the first leftover as an `unknown option` whenever it starts with `-`, regardless of whether that leftover appeared before or after a `--`. It is invoked for `init` (src/cli.ts:237).

Why it matters: a `-`-prefixed token AFTER `--` is a positional per the parser's contract, not a flag.
- Behavioral (rejectStrayCommandFlags): `lore --version tasks -- -x` errors `unknown option "-x"` (exit 2) instead of printing the version, whereas `lore --version tasks -- foo` correctly prints it (exit 0) — an inconsistent false rejection driven only by the leading dash. `lore --help tasks -- -x` likewise errors instead of rendering tasks help. Both are confirmed live via `bun run src/cli.ts ...`.
- Cosmetic (rejectCommandArgs): `lore init -- -bar` still errors (init takes no arguments regardless), but mislabels the post-`--` positional as `unknown option "-bar"` rather than an unexpected argument, and emits it under the `options` key instead of `unexpected` in the `--json` error envelope.

Provenance: Codex second-opinion review (backlog doc-2), low-severity cluster `cli-entry-state`; round-3 re-audit confirmed the defect survives the round-1/2 campaign. Existing coverage for the version/help/no-command paths and the init `takes no arguments` / `unknown option` distinction already lives in test/cli.test.ts, so the new cases extend an established harness.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `bun run src/cli.ts --version tasks -- -x` prints the version and exits 0 — a `-`-prefixed token after `--` is treated identically to the plain positional in `lore --version tasks -- foo`.
- [x] #2 `bun run src/cli.ts --help tasks -- -x` renders the `tasks` command help and exits 0.
- [x] #3 `bun run src/cli.ts init -- -bar` still errors (init takes no arguments) but the diagnostic classifies `-bar` as an unexpected argument (message and `--json` error `data` shape), not an `unknown option`.
- [x] #4 Regression guard: a stray flag appearing BEFORE any `--` is still rejected on the version/help paths — e.g. `lore --version --bogus` and `lore --version tasks --bogus` still error `unknown option "--bogus"`; and `lore init --bogus` still reports it as an unknown option.
- [x] #5 New unit tests in test/cli.test.ts cover the post-`--` positional cases for both helpers (version path, help-with-command path, and init), and the full suite (`bun test`) passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In rejectStrayCommandFlags: find first literal '--' index in commandArgs; only scan tokens BEFORE it for a leading '-' (excluding bare '-'), so a flag-looking token after the terminator is a positional and no longer rejected. 2. In rejectCommandArgs: split commandArgs into before/after the first '--'; only 'before' tokens can classify as unknown-option; any leftover (before positional, or anything at/after the terminator) is classified as unexpected-argument (data.unexpected), never options, matching the parser's documented --  contract. 3. Add unit tests in test/cli.test.ts covering: --version <cmd> -- -x (version, exit 0), --help <cmd> -- -x (command help, exit 0), init -- -bar (unexpected not unknown-option, text+--json), and regression guards for pre-terminator stray flags on version/version-with-command/init. 4. Verify via bun test + bun run typecheck + manual bun run src/cli.ts invocations for every AC.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified live via bun run src/cli.ts: (1) --version tasks -- -x -> prints VERSION, exit 0. (2) --help tasks -- -x -> renders tasks command help (Usage: lore tasks <id>, --status flag), exit 0. (3) init -- -bar -> errors 'lore init takes no arguments, got "-bar"' (not 'unknown option'), and --json error data is {command:'init', unexpected:['-bar']} (no 'options' key). (4) Regression: --version --bogus, --version tasks --bogus, and init --bogus all still error unknown option "--bogus" pre-terminator. Added 6 new tests in test/cli.test.ts (new describe block 'post-`--` tokens are positionals, not re-scanned flags'). Full bun test: 1930 pass / 0 fail (cli.test.ts alone: 37 pass, up from 31). bun run typecheck: clean. bunx biome check src/cli.ts test/cli.test.ts: clean (fixed one useOptionalChain nit along the way). Diff scoped to src/cli.ts + test/cli.test.ts only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed rejectStrayCommandFlags and rejectCommandArgs (src/cli.ts) to honor the parser's documented -- end-of-options contract: both now locate the first literal '--' token in commandArgs and only classify tokens BEFORE it as a leading '-' flag. rejectStrayCommandFlags no longer flags a post-'--' dash-token (lore --version tasks -- -x now prints the version instead of erroring; same for --help). rejectCommandArgs now reports a post-'--' leftover as an 'unexpected argument' (data.unexpected) rather than an 'unknown option' (lore init -- -bar), while a pre-terminator dash-flag is still an unknown option (regression-preserved: lore --version --bogus / --version tasks --bogus / init --bogus). Added 6 unit tests in test/cli.test.ts. Verified: bun test 1930 pass/0 fail; bun run typecheck clean; bunx biome check on both changed files clean; every AC behavior additionally exercised live via bun run src/cli.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
