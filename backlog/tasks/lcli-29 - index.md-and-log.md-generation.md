---
id: LCLI-29
title: index.md and log.md generation
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - core
milestone: m-4
dependencies:
  - LCLI-47
documentation:
  - docs/reference/okf-conformance.md
priority: medium
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deterministic, sorted generation; okf_version on root index only; sub-index files carry no frontmatter; index bodies link children as a navigable hub.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Regeneration is byte-identical on no change
- [x] #2 Sub-index files are frontmatter-free
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New pure module src/core/indexes.ts (mirrors log.ts as a separate generation module — bundle.ts's own header says index/log byte generation is NOT the graph layer's job). Export generateIndexes(g: BundleGraph, existing?: ReadonlyMap<string,string>): Map<string,string>. Path space = bundle-relative (matches loadBundle ids: 'index.md', 'adr/index.md'). 'existing' = injected seam carrying raw current index bytes (like GitAdapter for log); default empty → all-fresh scaffolds. Function reads only g.concepts.
2. Managed-listing-region model (user-chosen): regenerate ONLY a <!-- lore:index:begin -->…<!-- lore:index:end --> block; preserve all prose/frontmatter/modeline around it byte-for-byte by STRING-splicing into raw existing bytes (never round-tripping frontmatter through serializeConcept, which would drop the root index's in-fence modeline). Root index frontmatter/okf_version creation stays scaffold.ts/init's job — generateIndexes only maintains its region when the root index exists; sub-indexes synthesized frontmatter-free when absent (AC#2).
3. Dir set = every dir containing a concept + all ancestors to root. Per dir → index path P: listing = immediate child concepts (dirname==dir, excluding reserved index.md/log.md) + immediate child dirs in the set; entry '- [title](link)'; title = concept frontmatter.title(non-empty string) else id basename, child-dir = basename; link = relative path dir→target, segments percent-encoded (portable form); sorted by link via compareCodeUnits. Splice in place if markers present, else append after body (one blank line); synthesize '# <title>\n\n<region>\n' if file absent.
4. Portable link encoder: local encodePathSegments faithful to LCLI-28's (encodeURIComponent + escape !'()*); TODO swap for links.ts import once PR #19 merges (links.ts not on dev).
5. test/indexes.test.ts: golden listing; byte-identical regen / fixpoint (splice twice == once) [AC#1]; sub-index frontmatter-free [AC#2]; root region splice preserves frontmatter+modeline+prose; insert-when-no-markers; synthesize-when-absent; deterministic sort; nested dirs; reserved excluded; encoded links.
6. Gates: bun test + bunx biome check src/ test/ + bunx tsc --noEmit + coverage (core 100%); CHANGELOG Unreleased entry; /code-review max; PR into dev (Jeremy merges).
Scope boundaries: wiring into lore sync = LCLI-26; remark/AST unification of managed regions = LCLI-22; encoder consolidation after #19.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/core/indexes.ts (commit 21f72d1) + hardening (8ea3fb1) on feat/lore-29-index-log. Pure generateIndexes(g, { existing }) builds graph-derived navigable index.md hubs via the user-chosen managed-listing-region model (<!-- lore:index:begin -->…<!-- lore:index:end -->): only the listing block is regenerated, string-spliced into raw existing bytes so frontmatter/modeline/prose survive byte-for-byte (lore-design §6.2); never round-tripped through serializeConcept. Existing index bytes are an injected seam (like GitAdapter for log). Sub-indexes synthesized frontmatter-free when absent (AC#2); okf_version/root creation stays init's job. Separate module mirroring log.ts (bundle.ts header says index/log byte-gen is not the graph layer's job). AC#1 (byte-identical regen) = fixpoint of the splice, tested. AC#2 tested.

/code-review max (workflow, 47 agents) disposition — 24 verified → 15 distinct. FIXED in 8ea3fb1: (166/222) untrusted titles single-lined + bracket-escaped + comment-sentinel-neutralized so a title can't break a link or poison its own block (the latter broke AC#1 self-fixpoint); (205) truncated block (orphan begin) rewritten to EOF so it converges instead of perpetual drift; (217) duplicate blocks collapsed first-begin→last-end so no stale block survives the drift gate; (196) present-but-empty file synthesized like absent; (99) stale scaffold.ts cross-ref bundle.generateIndexes→indexes.generateIndexes. DEFERRED (PLAUSIBLE, owned elsewhere): (161) root-hub links to frontmatter-free sub-indexes dangle in the graph → LCLI-27 link gate must treat reserved index/log targets as resolved (documented in module header + CHANGELOG); (197 absent-root okf_version, 201 CRLF, 100 case-sensitive reserved match) → LCLI-26 sync write layer; (277 encoder dup) → swap for links.ts encodePathSegments once LCLI-28 lands; (54 reserved-name dup, 156/116 micro-perf) → minor, left. Gates: 525 pass (+20 total), biome+tsc clean; indexes.ts 100% line/func.

Delivered via #20 (squash 875ee62 on dev). LCLI-29 complete.
<!-- SECTION:NOTES:END -->
