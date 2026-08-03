---
id: LCLI-229
title: >-
  replace.ts: sanitize discovered file paths in the report (strip ANSI/control
  chars) to prevent output forging
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - cmd-crud-a
  - codex-review-followup
  - output-sanitization
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: bug
ordinal: 331000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** The `lore replace` report must not let a discovered filename forge report lines or inject terminal escape sequences into pretty/plain output.

**Live state:** `render` (src/commands/replace.ts:317-322) interpolates each discovered file path verbatim — `` `${verb} ${f.count} in ${f.path}` `` — and is the renderer for both pretty and plain modes (reportRenderable, replace.ts:311-312). `f.path` is a discovered display path derived from real filesystem names (walkMarkdown / discover.ts `toRepoRelative`), which on POSIX may contain newlines or ANSI/ESC bytes. Those bytes reach the terminal unescaped. replace.ts imports only `EXIT_OK, LoreError, WarningCollector, Writer` from ../errors and applies no sanitization.

**Why it's a defect (and the established fix):** This is the same output-forging class the campaign already closed for rendered content fields. query.ts sanitizes every rendered field via the shared `sanitizeField` = `stripAnsiAndControls(singleLine(...))` (src/commands/query.ts:295-296) before interpolation, for exactly this reason (query.ts:264-267); core/links.ts (`sanitizeForMessage`, src/core/links.ts:583) and core/validate.ts (`sanitizeForMessage`, src/core/validate.ts:342) do the same for message-embedded values. The shared primitives live in errors.ts (`singleLine` errors.ts:142, `stripAnsiAndControls` errors.ts:168, consolidated in LCLI-181). replace.ts's per-file report was never brought into that pattern. The `--json` envelope is unaffected because JSON string serialization already escapes control characters.

**Scope note (corrected from the round-3 spec):** replace.ts is NOT the only renderer of untrusted *path* text — validate.ts renders its discovered `file.path` equally unsanitized (src/commands/validate.ts:229, 232, 234). That parallel gap is out of scope for THIS task (which is scoped to replace.ts:309) but should be tracked as a sibling follow-up rather than being implied not to exist.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster cmd-crud-a. Round-3 re-audit confirmed the gap is still live on dev; the adversarial verifier corrected the spec's 'one renderer' over-claim.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The text renderer `render` in replace.ts passes each file path through the shared `stripAnsiAndControls(singleLine(...))` (mirroring query.ts `sanitizeField`) before interpolation, for both pretty and plain modes.
- [x] #2 A test drives a ReplaceReport (or a discovered fixture) whose file path contains a newline and an ANSI escape (e.g. `\x1b[31m`) and asserts the rendered report contains no raw ESC byte (`\x1b`) and no embedded newline inside a per-file line.
- [x] #3 Normal repo-relative POSIX paths render byte-identically to today (sanitization is a no-op on paths without control/ANSI bytes); the `--json` envelope output is unchanged.
- [x] #4 The full test suite passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Import singleLine + stripAnsiAndControls from ../errors into replace.ts. 2. Add a local sanitizeField(text) = stripAnsiAndControls(singleLine(text)) mirroring query.ts's sanitizeField, and apply it to each f.path in render() (shared by both pretty and plain via reportRenderable). 3. Add tests: a discovered fixture whose filename embeds a newline + ANSI CSI escape, asserting the plain/pretty rendered text has no raw ESC byte and no smuggled extra line; a --json test proving the envelope keeps the raw path unchanged. 4. Verify full bun test + typecheck + biome on changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: render() in replace.ts now maps each f.path through a local sanitizeField(text) = stripAnsiAndControls(singleLine(text)), imported from ../errors (no copied regex), mirroring query.ts's sanitizeField (LCLI-118). reportRenderable's pretty and plain both call render(), so both modes are sanitized identically. Verification: (1) bun test test/replace.test.ts -> 90 pass, 0 fail, incl. 2 new tests: a discovered fixture named 'evil\n\x1b[31mline.md' rendered in both plain and pretty mode produces the exact string 'would replace 1 in docs/evil line.md\n1 match in 1 of 1 file (dry-run)\n' (no raw ESC byte, no embedded newline splitting the per-file line), while the --json envelope for the same fixture round-trips report.files[0].path as the raw 'docs/evil\n\x1b[31mline.md' unchanged (AC#3 JSON untouched). (2) full bun test -> 1961 pass, 0 fail across 47 files. (3) bun run typecheck -> clean (tsc --noEmit, no output). (4) bunx biome check src/commands/replace.ts test/replace.test.ts -> 'Checked 2 files in 27ms. No fixes applied.' (5) Pre-existing tests ('plain mode renders a per-file line and a summary', dry-run singular-noun test, --in=value inline test) already pin normal repo-relative POSIX paths and still pass unmodified, proving sanitization is a byte-identical no-op on control-free paths (AC#3).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
replace.ts's plain/pretty report renderer sanitizes each discovered file path (stripAnsiAndControls(singleLine(path)), imported from ../errors, mirroring query.ts's sanitizeField) before interpolating it into 'verb count in path' lines, so a filesystem-derived path carrying a newline or ANSI escape can no longer forge terminal output or smuggle an extra line. Both pretty and plain modes are covered (they share one render() via reportRenderable). The --json envelope is untouched — it still carries the raw path. Verified via bun test (90/90 in replace.test.ts, 1961/1961 repo-wide, 0 failures), bun run typecheck (clean), and bunx biome check on the two changed files (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
