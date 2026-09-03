---
id: LCLI-372
title: >-
  Templates with their own frontmatter yield double frontmatter, undetected by
  validate/check
status: Done
assignee: []
created_date: '2026-09-02 20:12'
updated_date: '2026-09-03 02:24'
labels: []
dependencies: []
references:
  - >-
    Reported in an issues dump relayed via opum-agent from other agents'
    lore/quest sessions
  - '2026-09-02'
modified_files:
  - src/commands/new.ts
priority: high
type: bug
ordinal: 499000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A .lore/templates/<type>.md custom template that itself begins with a YAML frontmatter fence (rather than body-only content) does not get its frontmatter stripped or merged during lore new scaffold. The generated file ends up with the real generated frontmatter block followed immediately by the template's own frontmatter fence and fields, which the parser then treats as literal body text. Both lore validate and lore check exit 0 -- a silent correctness bug, since nothing in the pipeline flags the malformed structure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lore new --template <name> either rejects a template file that begins with its own frontmatter fence at scaffold time, or correctly strips/merges it so only one frontmatter block survives in the generated file
- [x] #2 lore validate and lore check both flag a double-frontmatter file as an error if one is ever produced (defense in depth, in case a template is hand-edited directly on disk after scaffold)
- [x] #3 Re-scoped 2026-09-02 per opum-agent ruling: the implemented approach (AC1) rejects a self-frontmatter template outright rather than stripping/merging it, so no test can assert a single-fence *output* from a successful merge. Instead assert (a) scaffold-time rejection of a template beginning with its own frontmatter fence (test/new.test.ts:290, already passing) and (b) a hand-planted double-frontmatter file already on disk is flagged as an error by both lore validate and lore check (defense-in-depth, AC2).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-scope AC3 wording per opum-agent ruling (done). 2. Add src/core/concept.ts hasStrayFrontmatterFence(body): reuse splitFrontmatter on the body to detect a parseable second frontmatter mapping immediately after the real one closes, without false-flagging a bare thematic-break '---'. 3. Wire it into core/validate.ts's validateConceptText (new 'frontmatter'-rule error finding) and core/check.ts's checkBundle (new 'double-frontmatter' CheckRule, error tier). 4. Add regression tests in validate.test.ts and check.test.ts: a hand-planted double-frontmatter file is flagged by each, and a legitimate thematic-break body is not false-flagged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
hasStrayFrontmatterFence (src/core/concept.ts) reuses splitFrontmatter's own fence/mapping parse on the body -- one judgement, shared by validate and check. validate.ts emits it as a 'frontmatter'-rule error finding; check.ts adds a new 'double-frontmatter' CheckRule (error tier). bun test test/validate.test.ts test/check.test.ts test/new.test.ts: 435 pass, 0 fail. tsc --noEmit and biome check clean (pre-existing biome warning in unrelated src/commands/agents.ts, untouched by this change).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
AC2/AC3 closed. src/core/concept.ts:hasStrayFrontmatterFence detects a second parseable frontmatter mapping at the start of a concept's body; wired into core/validate.ts (new error finding, rule 'frontmatter') and core/check.ts (new error-tier CheckRule 'double-frontmatter'). Verified: validate.test.ts and check.test.ts each add a hand-planted double-frontmatter fixture asserting the error fires, plus a thematic-break-only fixture asserting no false positive; test/new.test.ts:290 (AC1) still passes unchanged. bun test: 435/435 pass. tsc --noEmit and biome check: clean (no new findings).
<!-- SECTION:FINAL_SUMMARY:END -->
