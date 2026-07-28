---
id: LCLI-52
title: Reconcile stale remark/unified doc references across ADRs and specs
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:23'
labels:
  - docs
  - cleanup
dependencies: []
priority: low
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tech-stack.md and ADR-0001 described dependencies that were never actually
adopted (Commander, unified/remark, remark-validate-links -- confirmed via
package.json: only mdast-util-from-markdown, gray-matter, js-yaml, zod).
LCLI-14 corrected tech-stack.md and ADR-0001's one factual dependency list,
but 8 other docs still reference the stale remark/unified framing as if it
were current architecture: docs/index.md, docs/adr/0007-validation-and-coherence.md,
docs/adr/0008-managed-block-remark-ast.md, docs/adr/0010-multi-consumer-docs-layer.md,
docs/adr/0011-frontmatter-serialization-stability.md, docs/reference/architecture.md,
docs/specs/lore-design.md, docs/reference/okf-conformance.md.

ADR-0008's own BODY already correctly documents the LCLI-22 amendment away from
remark/unified toward mdast-util-from-markdown-only ("not unified().use(remarkParse)")
-- it is specifically the surrounding narrative/title/description framing (and
the other 7 docs) that still speak as if the full remark/unified pipeline ships.

Note: ADRs are point-in-time decision records, not living docs -- this task is
about clarifying/annotating where prose has drifted from the decision actually
implemented (e.g. a corrective note or amendment marker), not rewriting ADR
history. Reconcile each file's claims against actual shipped code (grep imports
in src/) before editing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every doc reference to remark/unified/remark-validate-links/Commander accurately reflects what is actually shipped (grep-verified against src/ imports and package.json), or is clearly marked as an amended/superseded historical decision
- [x] #2 docs/index.md and architecture.md (the most-read entry points) are corrected first
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Verified against package.json + grep of src/ imports: lore's only markdown dependency is mdast-util-from-markdown (parser only); no remark, unified, remark-validate-links, remark-lint, or commander packages exist or are imported anywhere. CLI parsing is hand-rolled (src/cli.ts); internal link/anchor validation and the portability lint are hand-rolled over the mdast tree (src/core/bundle.ts, src/core/check.ts, src/core/links.ts); managed-block regeneration parses via mdast-util-from-markdown then string-splices (never remark-stringify/mdast-util-to-markdown) per ADR-0008's own LCLI-22 amendment.

Two categories, per the task's own guidance (ADRs are point-in-time records -- annotate, don't rewrite):

A. Living docs (direct correction to match shipped reality), AC#2 priority order:
1. docs/index.md (line 58: stack list)
2. docs/reference/architecture.md (mermaid label, prose, module table x2, tech-stack summary line)
3. docs/specs/lore-design.md (tree comment x2, prose, module description)
4. docs/reference/okf-conformance.md (command-table cell)

B. ADRs (point-in-time decision records) -- add or extend a dated Status amendment note (matching each ADR's own existing amendment convention, e.g. ADR-0007's LCLI-46/LCLI-47 notes, ADR-0008's LCLI-22 note) clarifying that remark/unified/remark-validate-links/remark-lint mentions describe the ORIGINAL plan, not shipped code -- plus light inline correction of any small cross-reference to another ADR's now-wrong claim (not the ADR's own core decision):
5. docs/adr/0007-validation-and-coherence.md -- new Status amendment: remark-validate-links/remark-lint were never adopted; validation is hand-rolled over the same mdast tree. Core decision (pure-JS, no Rust runtime, MDX-safe, deterministic gate) is unaffected and stands.
6. docs/adr/0008-managed-block-remark-ast.md -- new Status amendment closing the one gap LCLI-22's amendment didn't cover: the Context/Decision/Consequences claims that lore 'depends on unified/remark' for the parser. It never did -- only mdast-util-from-markdown.
7. docs/adr/0010-multi-consumer-docs-layer.md -- inline fix to the '(remark-validate-links; see validation & coherence)' parenthetical (a passing cross-reference, not this ADR's own decision).
8. docs/adr/0011-frontmatter-serialization-stability.md -- inline fix to two cross-references to ADR-0008 that are now doubly wrong post-LCLI-22 ('frozen remark-stringify config used for managed blocks' -- no such config exists anymore; 'owned by the remark layer' -- no remark layer exists).

All edits via 'lore replace', never hand-edited. Verify with 'lore check' after each file. Also verify src/core/links.ts's own docstring (not in the original 8-file list, found during research) makes the identical stale remark-validate-links claim -- flag to user as a discovered adjacent finding rather than silently including it, per scope-change guidance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restore-session dedup 2026-07-16: an independent duplicate (LCLI-53, filed 2026-07-12) of this same task was found via 'backlog task view LCLI-52' returning an ambiguous-ID error. 'backlog doctor --fix --yes' repaired the collision (retargeted the duplicate to LCLI-53) and LCLI-53 was then archived as a duplicate. This file (the original, filed 2026-07-11, with the verified 8-file list) remains the authoritative LCLI-52. Confirmed LCLI-14's /code-review notes (lines 79/82, 'matching LCLI-52's correct count of 8') already reference this task correctly -- no reference fix needed.

All 8 files corrected via 'lore replace' (never hand-edited). Living docs (docs/index.md, architecture.md, lore-design.md, okf-conformance.md) corrected directly to match tech-stack.md's LCLI-14-verified stack (hand-rolled CLI parsing, gray-matter, mdast-util-from-markdown, Zod -- no Commander/remark/unified/remark-validate-links anywhere). ADRs (0007, 0008, 0010, 0011) kept as point-in-time decision records per this task's own guidance: added or extended dated 'Amended (LCLI-52)' Status notes (matching each ADR's existing amendment convention, e.g. 0007's LCLI-46/47 notes, 0008's LCLI-22 note) rather than rewriting historical decision text; small cross-references to another ADR's now-doubly-wrong claim (0010's remark-validate-links citation, 0011's two citations of ADR-0008's now-superseded remark-stringify/remark-layer framing) were corrected inline since they're passing technical details, not each ADR's own core decision. Frontmatter (title/description/tags/summary) left unchanged on all ADRs, matching the established precedent from ADR-0002's own amendment (added in a prior session) which also left frontmatter untouched and put the correction in the body. Verified with 'lore check' after every file (37 files, 0 errors/warnings throughout) and a final grep sweep confirming every remaining remark/unified/commander mention is either (a) historical decision text now covered by an amendment banner, (b) ADR-0008's own preserved historical title cited elsewhere, or (c) a false-positive match on the English word 'unified', not the npm package.

Discovered adjacent finding, NOT included in this task (outside the 8-file scope; flagging per scope-change guidance rather than silently expanding): src/core/links.ts's own module docstring (line 40-41) makes the identical stale claim -- 'whole-graph link/anchor resolution (validateLinks(graph) via remark-validate-links) pairs with lore check (LCLI-30)' -- remark-validate-links is not a dependency there either. This is source code, not a docs/ file, and wasn't part of LCLI-52's verified 8-file list. Recommend a tiny follow-up (or fold into the next touch of that file) rather than reopening this task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reconciled all 8 stale remark/unified/Commander references identified in this task's description: 4 living docs corrected directly to match the LCLI-14-verified shipped stack (docs/index.md, reference/architecture.md, specs/lore-design.md, reference/okf-conformance.md), and 4 ADRs (0007, 0008, 0010, 0011) got dated 'Amended (LCLI-52)' Status notes or small inline cross-reference fixes, preserving each ADR as a point-in-time decision record rather than rewriting history. All edits via lore replace; verified clean with lore check throughout (37 files, 0 errors/warnings) and a final grep sweep. One adjacent finding (src/core/links.ts's docstring, source code not docs/) flagged in notes as out of this task's scope.
<!-- SECTION:FINAL_SUMMARY:END -->
