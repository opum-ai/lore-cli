---
id: LORE-229
title: >-
  replace.ts: sanitize discovered file paths in the report (strip ANSI/control
  chars) to prevent output forging
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-crud-a
  - codex-review-followup
  - output-sanitization
dependencies: []
priority: low
type: bug
ordinal: 331000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** The `lore replace` report must not let a discovered filename forge report lines or inject terminal escape sequences into pretty/plain output.

**Live state:** `render` (src/commands/replace.ts:317-322) interpolates each discovered file path verbatim — `` `${verb} ${f.count} in ${f.path}` `` — and is the renderer for both pretty and plain modes (reportRenderable, replace.ts:311-312). `f.path` is a discovered display path derived from real filesystem names (walkMarkdown / discover.ts `toRepoRelative`), which on POSIX may contain newlines or ANSI/ESC bytes. Those bytes reach the terminal unescaped. replace.ts imports only `EXIT_OK, LoreError, WarningCollector, Writer` from ../errors and applies no sanitization.

**Why it's a defect (and the established fix):** This is the same output-forging class the campaign already closed for rendered content fields. query.ts sanitizes every rendered field via the shared `sanitizeField` = `stripAnsiAndControls(singleLine(...))` (src/commands/query.ts:295-296) before interpolation, for exactly this reason (query.ts:264-267); core/links.ts (`sanitizeForMessage`, src/core/links.ts:583) and core/validate.ts (`sanitizeForMessage`, src/core/validate.ts:342) do the same for message-embedded values. The shared primitives live in errors.ts (`singleLine` errors.ts:142, `stripAnsiAndControls` errors.ts:168, consolidated in LORE-181). replace.ts's per-file report was never brought into that pattern. The `--json` envelope is unaffected because JSON string serialization already escapes control characters.

**Scope note (corrected from the round-3 spec):** replace.ts is NOT the only renderer of untrusted *path* text — validate.ts renders its discovered `file.path` equally unsanitized (src/commands/validate.ts:229, 232, 234). That parallel gap is out of scope for THIS task (which is scoped to replace.ts:309) but should be tracked as a sibling follow-up rather than being implied not to exist.

**Provenance:** Codex second-opinion review (backlog doc-2), Low-severity findings, cluster cmd-crud-a. Round-3 re-audit confirmed the gap is still live on dev; the adversarial verifier corrected the spec's 'one renderer' over-claim.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The text renderer `render` in replace.ts passes each file path through the shared `stripAnsiAndControls(singleLine(...))` (mirroring query.ts `sanitizeField`) before interpolation, for both pretty and plain modes.
- [ ] #2 A test drives a ReplaceReport (or a discovered fixture) whose file path contains a newline and an ANSI escape (e.g. `\x1b[31m`) and asserts the rendered report contains no raw ESC byte (`\x1b`) and no embedded newline inside a per-file line.
- [ ] #3 Normal repo-relative POSIX paths render byte-identically to today (sanitization is a no-op on paths without control/ANSI bytes); the `--json` envelope output is unchanged.
- [ ] #4 The full test suite passes.
<!-- AC:END -->
