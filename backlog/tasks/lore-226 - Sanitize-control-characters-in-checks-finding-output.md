---
id: LORE-226
title: Sanitize control characters in check's finding output
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-check
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 328000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`lore check` emits untrusted, author-controlled content to the terminal without control-character escaping, so a crafted markdown link target/filename can inject ANSI escape sequences or newlines into `check`'s plain and pretty stdout.

**Live context.** `findingLine` (`src/commands/check.ts:966-969`) interpolates `finding.file` and `finding.message` raw. Those messages embed the raw untrusted link destination: `src/core/check.ts:549` (broken-link) and `src/core/check.ts:585` (broken-anchor) interpolate `${target}`/`${fragment}` verbatim. An embedded newline additionally forges a phantom finding row (`renderReport` joins lines with `\n`, `src/commands/check.ts:956-963`).

**Why.** This is the same terminal/log-injection class already fixed in every sibling surface — `output.ts` renderTaskSummaryRows (LORE-115), `commands/query.ts` (LORE-118), `core/validate.ts` (LORE-161), `core/links.ts` (LORE-153) — all via the shared `stripAnsiAndControls` at `src/errors.ts:168-176`. `check` is the remaining un-sanitized command on this class of finding.

**Provenance.** doc-2 Codex second-opinion review, Low-severity cluster `cmd-check`, finding [2]. Verified still-open against `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A broken-link/broken-anchor finding whose link target or filename contains an ESC/CSI sequence or a newline renders with those control characters stripped in both plain and pretty modes (no raw ESC bytes, no phantom finding lines).
- [ ] #2 The fix reuses the shared `stripAnsiAndControls` helper (src/errors.ts) rather than a new copy of the regexes.
- [ ] #3 Ordinary finding output (paths, rules, messages without control characters) is unchanged.
- [ ] #4 Existing check tests continue to pass.
<!-- AC:END -->
