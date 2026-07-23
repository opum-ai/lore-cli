---
id: LORE-223
title: >-
  cli.ts: rejectStrayCommandFlags/rejectCommandArgs re-scan post-`--` tokens as
  flags
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 `bun run src/cli.ts --version tasks -- -x` prints the version and exits 0 — a `-`-prefixed token after `--` is treated identically to the plain positional in `lore --version tasks -- foo`.
- [ ] #2 `bun run src/cli.ts --help tasks -- -x` renders the `tasks` command help and exits 0.
- [ ] #3 `bun run src/cli.ts init -- -bar` still errors (init takes no arguments) but the diagnostic classifies `-bar` as an unexpected argument (message and `--json` error `data` shape), not an `unknown option`.
- [ ] #4 Regression guard: a stray flag appearing BEFORE any `--` is still rejected on the version/help paths — e.g. `lore --version --bogus` and `lore --version tasks --bogus` still error `unknown option "--bogus"`; and `lore init --bogus` still reports it as an unknown option.
- [ ] #5 New unit tests in test/cli.test.ts cover the post-`--` positional cases for both helpers (version path, help-with-command path, and init), and the full suite (`bun test`) passes.
<!-- AC:END -->
