---
id: LORE-249
title: 'Harden stderrHint: strip terminal control sequences and cap length'
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - errors-output-git
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 351000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** A `LoreError` hint built from a failed subprocess's stderr must not carry raw terminal control sequences (ANSI CSI/OSC, bare BEL/backspace, other C0/C1 bytes) through to the user's terminal, and must not be unbounded in length.

**Why:** `stderrHint` (src/errors.ts:185-188) currently only trims and collapses whitespace (`stderr.trim().replace(/\s+/g, " ")`); it strips no control bytes and caps no length. Its return value becomes a `LoreError.hint` at src/adapters/git.ts:86,155,183, src/adapters/backlog.ts:796,840, and src/state.ts:381. The hint-render path — `formatErrorText` (src/errors.ts:270) and `toErrorEnvelope` (src/errors.ts:206) — applies only `singleLine(asText(...))`, never `stripAnsiAndControls` (src/errors.ts:168). So a CSI/OSC escape or bare control byte echoed in a subprocess's stderr (e.g. git echoing a crafted ref or path, or a hostile `backlog` process) reaches the terminal unstripped and can move the cursor, erase lines, or forge rows — the same injection class `stripAnsiAndControls` was introduced (LORE-181) to block on other rendered surfaces. An arbitrarily long stderr also becomes an unbounded one-line hint. The `stderrHint` doc comment (src/errors.ts:178-184) already names 'stripping ANSI, capping length' as belonging in this single shared home.

**Provenance:** doc-2 Codex second-opinion review, low-severity finding (cited errors.ts:153), errors-output-git cluster. Re-verified still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 stderrHint strips ANSI escape sequences and residual C0/C1/DEL control bytes from its result (reusing the existing stripAnsiAndControls primitive), so the returned string contains no ESC (\x1b) byte and no other \x00-\x1f / \x7f-\x9f byte.
- [ ] #2 stderrHint caps its returned hint to a bounded maximum length (with a truncation indicator), so an arbitrarily long subprocess stderr cannot produce an unbounded hint.
- [ ] #3 The existing contract is preserved: an input that is empty or whitespace-only after normalization still returns undefined.
- [ ] #4 Unit test: a stderr string containing `\x1b[31m...\x1b[0m` and a bare BEL (\x07) yields a hint with all those control bytes removed.
- [ ] #5 Unit test: an over-length stderr yields a hint no longer than the cap.
- [ ] #6 All existing tests in test covering errors.ts, git-adapter, backlog, and state continue to pass.
<!-- AC:END -->
