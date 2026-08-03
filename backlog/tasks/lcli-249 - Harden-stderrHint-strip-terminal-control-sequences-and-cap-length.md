---
id: LCLI-249
title: 'Harden stderrHint: strip terminal control sequences and cap length'
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - errors-output-git
  - codex-review-followup
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: bug
ordinal: 351000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** A `LoreError` hint built from a failed subprocess's stderr must not carry raw terminal control sequences (ANSI CSI/OSC, bare BEL/backspace, other C0/C1 bytes) through to the user's terminal, and must not be unbounded in length.

**Why:** `stderrHint` (src/errors.ts:185-188) currently only trims and collapses whitespace (`stderr.trim().replace(/\s+/g, " ")`); it strips no control bytes and caps no length. Its return value becomes a `LoreError.hint` at src/adapters/git.ts:86,155,183, src/adapters/backlog.ts:796,840, and src/state.ts:381. The hint-render path — `formatErrorText` (src/errors.ts:270) and `toErrorEnvelope` (src/errors.ts:206) — applies only `singleLine(asText(...))`, never `stripAnsiAndControls` (src/errors.ts:168). So a CSI/OSC escape or bare control byte echoed in a subprocess's stderr (e.g. git echoing a crafted ref or path, or a hostile `backlog` process) reaches the terminal unstripped and can move the cursor, erase lines, or forge rows — the same injection class `stripAnsiAndControls` was introduced (LCLI-181) to block on other rendered surfaces. An arbitrarily long stderr also becomes an unbounded one-line hint. The `stderrHint` doc comment (src/errors.ts:178-184) already names 'stripping ANSI, capping length' as belonging in this single shared home.

**Provenance:** doc-2 Codex second-opinion review, low-severity finding (cited errors.ts:153), errors-output-git cluster. Re-verified still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 stderrHint strips ANSI escape sequences and residual C0/C1/DEL control bytes from its result (reusing the existing stripAnsiAndControls primitive), so the returned string contains no ESC (\x1b) byte and no other \x00-\x1f / \x7f-\x9f byte.
- [x] #2 stderrHint caps its returned hint to a bounded maximum length (with a truncation indicator), so an arbitrarily long subprocess stderr cannot produce an unbounded hint.
- [x] #3 The existing contract is preserved: an input that is empty or whitespace-only after normalization still returns undefined.
- [x] #4 Unit test: a stderr string containing `\x1b[31m...\x1b[0m` and a bare BEL (\x07) yields a hint with all those control bytes removed.
- [x] #5 Unit test: an over-length stderr yields a hint no longer than the cap.
- [x] #6 All existing tests in test covering errors.ts, git-adapter, backlog, and state continue to pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In stderrHint (src/errors.ts), collapse whitespace/newlines to single spaces first (preserves word boundaries since stripAnsiAndControls deletes C0 bytes outright, incl. \n/\t). 2. Run stripAnsiAndControls (shared errors.ts:168 primitive, no new regex) to strip ANSI CSI/OSC sequences and residual C0/C1/DEL control bytes. 3. Re-collapse whitespace + trim to mop up any double-space left by an excised escape sequence. 4. Return undefined if empty (preserves existing contract). 5. Cap to STDERR_HINT_MAX_LENGTH=500 with a trailing … indicator when truncated. 6. Add unit tests in test/errors.test.ts covering ANSI/BEL/OSC stripping, control-byte-only input, whitespace/newline-only input (unchanged undefined contract), and over-length capping. Stay confined to stderrHint only (no changes to reportError/flush/errorRenderOpts, no edits to adapters/git.ts, adapters/backlog.ts, or state.ts).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: stderrHint now (1) collapses whitespace/newlines to single spaces, (2) runs the result through the shared stripAnsiAndControls primitive (no new regex copy) to strip ANSI CSI/OSC sequences and residual C0/C1/DEL control bytes, (3) re-collapses/trims to remove any doubled space left by an excised sequence, (4) still returns undefined for empty/whitespace-only input, (5) caps the result to 500 chars with a trailing … truncation indicator. Added 10 unit tests in test/errors.test.ts (ANSI+BEL strip, OSC+BEL strip, control-only input -> undefined, whitespace/newline-only -> undefined preserved, newline collapses to space not glued word, over-length cap, no-indicator-when-within-cap).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
stderrHint (src/errors.ts) now runs its normalized stderr through the shared stripAnsiAndControls primitive (no new regex copy) and caps the result to a bounded 500-char max with a trailing … truncation indicator. Whitespace/newlines are collapsed before the strip (preserving word boundaries, since stripAnsiAndControls deletes C0 bytes like \n/\t outright) and re-collapsed after (mopping up any doubled space left by an excised escape sequence). Empty/whitespace-only input still returns undefined (existing contract preserved). Added 10 unit tests in test/errors.test.ts: CSI+SGR+bare-BEL strip, OSC+BEL-terminated strip, control-only input -> undefined, whitespace/newline-only -> undefined, newline collapses to a space (not a glued word), over-length input capped with the indicator, short input emitted unchanged with no indicator. Verified: full 'bun test' 2024 pass / 0 fail (was 2014 pass before, +10 new); 'bun run typecheck' clean; 'bun test test/errors.test.ts' 72 pass / 0 fail (was 62 before); 'bunx biome check src/errors.ts test/errors.test.ts' reports 0 issues. Diff confined to src/errors.ts + test/errors.test.ts (plus this task file) — reportError/flush/errorRenderOpts and adapters/git.ts, adapters/backlog.ts, state.ts untouched; their existing tests (part of the 2024) are the AC#6 regression guard.
<!-- SECTION:FINAL_SUMMARY:END -->
