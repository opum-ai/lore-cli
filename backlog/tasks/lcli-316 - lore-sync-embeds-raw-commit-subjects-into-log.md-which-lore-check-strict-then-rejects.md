---
id: LCLI-316
title: >-
  lore sync embeds raw commit subjects into log.md, which lore check --strict
  then rejects
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 23:52'
updated_date: '2026-08-05 04:39'
labels:
  - defect
  - docs-log
  - portability
  - cross-repo-report
dependencies: []
modified_files:
  - src/core/log.ts
  - test/log.test.ts
  - test/sync.test.ts
priority: medium
ordinal: 439000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`lore sync`'s log-sync generator embeds a commit's raw subject line directly into `log.md` with no MDX/Docusaurus escaping, and `lore check --strict` then flags that same generator-produced content as a portability violation -- a self-inflicted gate failure, not a user-authoring mistake.

Source: src/core/log.ts:163 builds each log line as:

    `- ${e.timestamp} ${e.hash} ${e.subject}`

`e.subject` is the commit's first line, used verbatim (only collapsed to a single line per the comment at log.ts:45-46) -- no escaping of MDX-unsafe characters (bare `<`, `>`, `{`, `}`, etc).

src/core/check.ts's portability rule (lines ~743, ~760) then correctly flags exactly this kind of raw content:

    non-portable raw "<" in prose; MDX (Docusaurus) reads it as the start of a JSX/HTML element -- escape it (&lt;) or wrap the text in backticks

Reproduced in opum-ai/quest-cli: a commit subject containing a literal `<->` (e.g. "docs: sync managed blocks after Story<->Task coupling fix") passed `lore sync` cleanly (log.ts has no lint of its own), but the next `lore check --strict` run against the regenerated `log.md` failed with exit 6 (0 errors, 2 warnings) purely because of that embedded raw `<`.

Because `log.md` is a fully machine-generated/managed file (per this project's own convention, never hand-edited), and the source commit message that caused it is often already pushed/shared history by the time the failure surfaces, there is no in-repo, non-destructive fix available to the consuming project. The only current workaround is amending and force-pushing the offending commit -- which is exactly the kind of action a consuming project should not need to take just to keep its own generated docs bundle passing its own strict gate.

## Suggested fix

Escape (or backtick-wrap) MDX-unsafe characters in `subject` at the point log.ts builds each entry line (log.ts:163), the same way check.ts's own portability rule expects prose to be escaped -- so the generator never produces content its own checker would reject. Alternatively/additionally, `lore check`'s portability rule could special-case content inside the machine-owned `log.md` file (skip linting generator-owned raw text), since a consuming project cannot fix generator output by editing prose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 log.ts's log-entry generation (or check.ts's portability rule) is fixed so a commit subject containing raw MDX-unsafe characters (starting with a bare `<`) does not cause `lore check --strict` to fail against `log.md`-only content
- [x] #2 A regression test covers a commit subject containing a bare `<` (or similar MDX-special character) surviving `lore sync` + `lore check --strict` with 0 errors/0 warnings
- [x] #3 No change narrows or weakens the portability rule's existing protection for hand-authored prose outside `log.md`
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pure log-subject renderer that leaves ordinary subjects unchanged and wraps subjects containing MDX-hazard characters in a collision-safe CommonMark code span. Keep raw normalized subjects as the deterministic sort key.
2. Add focused generateLog coverage for bare < and { plus embedded backtick runs, and prove the rendered log has no portability findings.
3. Add sync-to-strict-check regression coverage using a fake commit subject with MDX hazards, then run focused tests and the repository-required verification gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: render only commit subjects containing < or { as CommonMark code spans. The delimiter is one backtick longer than the longest run already in the subject, while ordinary subjects and raw-subject sorting remain byte-stable. The portability checker was not changed.

Verification:
- bun test test/log.test.ts test/sync.test.ts test/check.test.ts: 328 pass, 0 fail.
- npm run lint: 189 files checked, no fixes.
- npm run typecheck: passed.
- bun test --dots: 2454 pass, 1 skip, 0 fail across 75 files.
- git diff --check: passed.
- Adversarial direct probe covered ordinary subjects and hazardous subjects with two- and three-backtick runs; all produced 0 portability warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made generated log subjects MDX-safe without weakening hand-authored portability checks. Hazardous < or { subjects are wrapped in collision-safe CommonMark code spans; ordinary output and deterministic sorting are unchanged. Added renderer coverage and a sync -> check --strict regression proving 0 errors/0 warnings. Full lint, typecheck, and 2454-test suite pass.
<!-- SECTION:FINAL_SUMMARY:END -->
