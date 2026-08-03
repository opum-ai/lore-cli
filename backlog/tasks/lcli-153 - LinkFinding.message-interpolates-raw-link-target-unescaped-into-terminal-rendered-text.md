---
id: LCLI-153
title: >-
  LinkFinding.message interpolates raw link target unescaped into
  terminal-rendered text
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - core-links-resolution
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: medium
type: bug
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
validateLink builds LinkFinding.message by interpolating the raw, bundle-authored `target` string verbatim into human-readable text (src/core/links.ts:283, and similarly at lines 293, 308, 314, 320), with no control-character or ANSI/OSC escaping. These messages flow unsanitized to terminal output: check.ts:394-395 copies finding.message verbatim into a portability CheckFinding, and both src/commands/check.ts:926-929 and src/commands/validate.ts:238-240 print finding.message directly to stdout, applying only ANSI color paint to the severity token — never singleLine/stripAnsi sanitization (that helper is only used for error hints, output.ts:205,241). A link destination in a markdown file containing control/ANSI/OSC byte sequences can therefore inject escape sequences into the reviewer's terminal when they run `lore check` or `lore validate`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Link target text is sanitized (e.g. via the existing singleLine/stripAnsi helper in output.ts) before being embedded into LinkFinding.message, or the sanitization is applied at the check.ts/validate.ts print sites (findingLine) before writing finding.message to stdout, so control/ANSI/OSC bytes in a link target can no longer manipulate terminal output.
- [x] #2 A regression test confirms that a link target containing a raw ANSI escape or control character (e.g. `[31m`) produces a finding message with the escape sequence stripped or neutralized, for at least one of the four LinkFinding issue kinds (missing-extension, directory-link, leading-slash, accidental-colon, unencoded).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a local `sanitizeForMessage(text)` helper in src/core/links.ts: singleLine() (from ../errors) to collapse line terminators, then strip ANSI/OSC escape sequences and residual C0/C1/DEL control bytes — the same two-pass shape output.ts's private stripAnsiAndControls uses, reimplemented locally (mirrors the LCLI-161 precedent already in core/validate.ts's sanitizeForMessage, since links.ts/core modules stay output-layer-free and cannot import a non-exported helper from the command-layer output.ts).
2. Wrap the raw `target` interpolation with sanitizeForMessage(target) at all 5 LinkFinding.message build sites in validateLink (accidental-colon, leading-slash, directory-link, missing-extension, and inside encodingMessage for the unencoded finding). Leave LinkFinding.target itself raw/unsanitized (it is documented as "as authored").
3. Add regression tests in test/links.test.ts: a leading-slash target and a missing-extension target each carrying a raw ANSI escape / control byte, asserting the resulting finding.message has the escape/control byte stripped while finding.target stays raw.
4. Verify: bun test (full suite), bun run typecheck, bun run lint (biome check, scoped to my two touched files — confirm any repo-wide lint failures are pre-existing/out of scope via revert+reapply).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented at the MESSAGE-CONSTRUCTION site in src/core/links.ts only (per scope constraint), not at check.ts/validate.ts print sites.

Fix: added a private sanitizeForMessage(text) helper in links.ts — singleLine() (imported from ../errors) collapses line terminators, then a two-pass regex strips ANSI/OSC escape sequences and residual C0/C1/DEL control bytes (same shape as output.ts's private stripAnsiAndControls; reimplemented locally as a core module — the identical pattern core/validate.ts already uses for its own `resource` finding message, LCLI-161). Wired sanitizeForMessage(target) into all 5 LinkFinding.message interpolation sites (accidental-colon, leading-slash, directory-link, missing-extension, unencoded/encodingMessage). LinkFinding.target itself stays raw/unsanitized (documented as "as authored").

Note: output.ts's stripAnsiAndControls is not exported, so importing it per the task's literal wording was not possible without editing output.ts (out of scope for this task); followed the codebase's own established local-reimplementation convention instead (core/validate.ts, core/commands/query.ts already do this for the same layering reason).

Verification (objective evidence):
- `bun test` (full suite): 1890 pass, 0 fail, 5329 expect() calls, across 47 files.
- `bun run typecheck` (tsc --noEmit): clean, no errors.
- `bun run lint` (biome check): `bunx biome check src/core/links.ts test/links.test.ts` → 0 issues on both touched files. Full-repo `bun run lint` reports 3 pre-existing errors in test/context.test.ts, test/replace.test.ts, test/validate.test.ts — none touched by this change; confirmed pre-existing by reverting my diff (git apply -R) and re-running lint (same 3 errors reproduce on the unmodified baseline), then reapplying (git apply) to restore.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Sanitized the raw link target before it reaches LinkFinding.message, at the message-construction site in src/core/links.ts. Added a private sanitizeForMessage() helper (singleLine from ../errors + a local ANSI/control-byte strip, mirroring the LCLI-161 pattern already used in core/validate.ts for the identical layering reason) and applied it at all 5 message-interpolation sites in validateLink (accidental-colon, leading-slash, directory-link, missing-extension, unencoded). finding.target remains the raw authored string; only the printable message is sanitized. Added regression tests in test/links.test.ts covering leading-slash and missing-extension findings with an embedded raw ANSI escape / control byte, asserting the escape is stripped from message but target stays raw. Verified: bun test 1890/1890 pass; bun run typecheck clean; biome check clean on both touched files (repo-wide `bun run lint` has 3 pre-existing failures in untouched test files, confirmed pre-existing via revert/reapply).
<!-- SECTION:FINAL_SUMMARY:END -->
