---
id: LCLI-236
title: >-
  Strip ANSI/control/OSC escapes on the stderr warning path
  (WarningCollector.flush)
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - cmd-meta-a
  - codex-review-followup
  - security
dependencies: []
priority: low
type: bug
ordinal: 338000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Untrusted, source-controlled strings (task ids from a concept's `tasks:` frontmatter; Backlog task titles/statuses) reach lore's stderr warning path without ANSI/OSC/control-byte stripping, so a crafted or corrupted source field can forge terminal escape output on stderr. The text-table path was hardened — `output.ts`'s `renderTaskSummaryRows` (output.ts:413-422) runs every field through the shared `stripAnsiAndControls` (LCLI-115/LCLI-181) — but the warning path was not. `errors.ts`'s `WarningCollector.flush` (errors.ts:647-656) applies only `singleLine(asText(message))`, and `singleLine` (errors.ts:142-144) collapses line terminators (CR/LF/U+2028/U+2029) ONLY; it does not remove ESC-led CSI/OSC sequences or bare control bytes (BEL, backspace, C0/C1). `stripAnsiAndControls` already exists at errors.ts:168 but is never called in flush. `commands/tasks.ts`'s `warnDangling` (tasks.ts:191-196) interpolates raw dangling task ids (`ids.join(', ')`) into the message, so an id such as `LORE\x1b[2J-9` (not dash-prefixed, so rejectFlagLike at backlog.ts:647 passes it, and which Backlog then reports unknown → dangling) reaches stderr with its escape bytes intact. Fixing flush to run message bodies through the shared `stripAnsiAndControls` closes this centrally (covering every WarningCollector site, not only warnDangling) and makes flush's own docstring (errors.ts:638-641), which already claims it emits control characters safely, actually true. Provenance: Codex second-opinion review (backlog doc-2), low-severity finding, cluster cmd-meta-a; the text-table half of this same finding is already resolved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The stderr warning path strips ANSI escape sequences, OSC sequences, and residual C0/C1 control bytes from warning message bodies, reusing the shared stripAnsiAndControls from errors.ts (no new copy of the regexes), so a warning whose text contains e.g. \x1b[2J or a bare BEL emits with those bytes removed.
- [x] #2 The painted `warning:` prefix and its color are unaffected (color/prefix are applied by flush after sanitization).
- [x] #3 A regression test (test/errors.test.ts and/or test/tasks.test.ts) shows a warning message containing embedded ANSI/OSC/control bytes flushes with those bytes stripped, and a `lore tasks` run whose concept links a dangling id containing such bytes emits the stripped advisory.
- [x] #4 WarningCollector.flush's docstring matches its actual behavior.
- [x] #5 bun test is green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In errors.ts WarningCollector.flush, run each message body through the shared stripAnsiAndControls (after singleLine/asText), before writing — no new regex copy. 2. Build the painted 'warning:' prefix once (already loop-invariant) so sanitization touches the body only, never the prefix/color. 3. Update flush's docstring to describe the strip. 4. Add regression tests: test/errors.test.ts covers flush directly with embedded CSI/OSC/BEL bytes and confirms the colored prefix survives untouched; test/tasks.test.ts covers the end-to-end lore tasks dangling-id path with a tasks: id carrying an escaped CSI sequence (via YAML's \e escape in a quoted scalar, since a raw control byte is rejected by the YAML parser outright) and confirms the advisory emits with the escape stripped. 5. Verify: full bun test, bun run typecheck, bunx biome check on changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: full 'bun test' -> 1990 pass, 0 fail (47 files). 'bun run typecheck' clean (tsc --noEmit, no output). 'bunx biome check src/errors.ts test/errors.test.ts test/tasks.test.ts' -> 'Checked 3 files. No fixes applied.' Manually confirmed the pre-fix vs post-fix behavior via a throwaway repro script (not committed): a dangling tasks: id carrying an escaped CSI sequence (\x1b[2J) reached stderr with raw escape bytes intact before the fix, and emerges stripped (LCLI-9) after. AC#2 verified directly: flush({color:true}) on a message with an embedded CSI sequence emits exactly '\x1b[33mwarning:\x1b[0m dangerzone\n' -- the yellow prefix/reset untouched, only the body sanitized.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
WarningCollector.flush (src/errors.ts) now runs each warning's message body through the shared stripAnsiAndControls (errors.ts:168) after singleLine/asText, before writing it to stderr -- reusing the existing primitive, no new regex copy. The painted 'warning:' prefix is built once (loop-invariant, unchanged) and is never passed through the strip, so its color/escape sequence is unaffected (AC#2). flush's docstring now documents the strip and explains why sanitization is body-only (AC#4). Added regression tests: test/errors.test.ts exercises flush directly with an embedded CSI 'erase screen' sequence, an OSC hyperlink sequence, and a bare BEL, and confirms all are stripped while the colored prefix survives intact; test/tasks.test.ts exercises the real lore tasks path end-to-end -- a concept's tasks: frontmatter carries a dangling id with an escaped CSI sequence (a raw control byte is rejected by the YAML parser outright, so the test uses YAML's own \e escape inside a quoted scalar to get the ESC byte through frontmatter parsing, matching the task's described attack vector) -- and confirms warnDangling's advisory emits with the escape stripped (AC#3). Verified with full bun test (1990 pass, 0 fail), bun run typecheck (clean), and bunx biome check on the changed files (clean); no repo-wide lint run per task instructions.
<!-- SECTION:FINAL_SUMMARY:END -->
