---
id: LORE-236
title: >-
  Strip ANSI/control/OSC escapes on the stderr warning path
  (WarningCollector.flush)
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
Untrusted, source-controlled strings (task ids from a concept's `tasks:` frontmatter; Backlog task titles/statuses) reach lore's stderr warning path without ANSI/OSC/control-byte stripping, so a crafted or corrupted source field can forge terminal escape output on stderr. The text-table path was hardened — `output.ts`'s `renderTaskSummaryRows` (output.ts:413-422) runs every field through the shared `stripAnsiAndControls` (LORE-115/LORE-181) — but the warning path was not. `errors.ts`'s `WarningCollector.flush` (errors.ts:647-656) applies only `singleLine(asText(message))`, and `singleLine` (errors.ts:142-144) collapses line terminators (CR/LF/U+2028/U+2029) ONLY; it does not remove ESC-led CSI/OSC sequences or bare control bytes (BEL, backspace, C0/C1). `stripAnsiAndControls` already exists at errors.ts:168 but is never called in flush. `commands/tasks.ts`'s `warnDangling` (tasks.ts:191-196) interpolates raw dangling task ids (`ids.join(', ')`) into the message, so an id such as `LORE\x1b[2J-9` (not dash-prefixed, so rejectFlagLike at backlog.ts:647 passes it, and which Backlog then reports unknown → dangling) reaches stderr with its escape bytes intact. Fixing flush to run message bodies through the shared `stripAnsiAndControls` closes this centrally (covering every WarningCollector site, not only warnDangling) and makes flush's own docstring (errors.ts:638-641), which already claims it emits control characters safely, actually true. Provenance: Codex second-opinion review (backlog doc-2), low-severity finding, cluster cmd-meta-a; the text-table half of this same finding is already resolved.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The stderr warning path strips ANSI escape sequences, OSC sequences, and residual C0/C1 control bytes from warning message bodies, reusing the shared stripAnsiAndControls from errors.ts (no new copy of the regexes), so a warning whose text contains e.g. \x1b[2J or a bare BEL emits with those bytes removed.
- [ ] #2 The painted `warning:` prefix and its color are unaffected (color/prefix are applied by flush after sanitization).
- [ ] #3 A regression test (test/errors.test.ts and/or test/tasks.test.ts) shows a warning message containing embedded ANSI/OSC/control bytes flushes with those bytes stripped, and a `lore tasks` run whose concept links a dangling id containing such bytes emits the stripped advisory.
- [ ] #4 WarningCollector.flush's docstring matches its actual behavior.
- [ ] #5 bun test is green.
<!-- AC:END -->
