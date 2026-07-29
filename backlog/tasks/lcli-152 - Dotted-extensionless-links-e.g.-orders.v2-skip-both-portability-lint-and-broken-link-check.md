---
id: LCLI-152
title: >-
  Dotted extensionless links (e.g. orders.v2) skip both portability lint and
  broken-link check
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:26'
labels:
  - codex-review-followup
  - core-links-resolution
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lacksMarkdownSuffix (src/core/links.ts:352-368) returns false for any link target whose last path segment contains a dot (`last.includes(".")`), so a dotted concept-style link like `orders.v2` (meant to reach `orders.v2.md`) is treated as an opaque asset and never flagged by the portability lint. The function's own doc comment (lines 347-350) claims this is safe because such a broken link "surfaces as a dangling edge" in lore check's link-existence pass instead — but that escape hatch does not exist: bundle.ts's internalTarget (lines 488-494) requires `/\.md$/i.test(path)` and returns null otherwise, so collectBodyEdges never creates an edge for it at all, and check.ts's linkFindings (lines 510-513) independently applies the same `.md`-suffix gate and returns `[]`. As a result, a broken dotted concept link is silently invisible to every lore check/lint mechanism.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A link target with a dotted, extensionless last segment intended as a concept reference (e.g. `orders.v2` where no `orders.v2.md` file exists) is now surfaced as a finding by at least one of: the portability lint (validateLink/lacksMarkdownSuffix) or the broken-link existence check (linkFindings) — the two mechanisms are no longer mutually exclusive gaps for this shape.
- [x] #2 The links.ts doc comment at lines 347-350 is corrected to no longer claim the broken-link check catches this case, if the fix is made in the portability lint rather than the resolver/existence check.
- [x] #3 Add a regression test exercising a dotted extensionless link with no matching file and asserting it produces a finding (from whichever mechanism is fixed).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a closed KNOWN_ASSET_EXTENSIONS allowlist (images/documents/data/archives/media/source-code exts) to src/core/links.ts.
2. Change lacksMarkdownSuffix so a dotted last-segment extension not on that allowlist (e.g. orders.v2) is treated as a dropped .md suffix (returns true) instead of an opaque asset, while known assets (.png, .csv, .ts, ...) and dotfiles stay clean.
3. Correct the false doc-comment claim (lines 347-350 orig) that the broken-link existence check catches this case -- it does not, since bundle.ts/check.ts still gate on a literal .md suffix and are out of scope for this fix.
4. Add a regression test in test/links.test.ts asserting orders.v2 (and a nested path variant) produces a missing-extension finding; mutation-check by reverting links.ts and confirming the new test fails.
5. Run bun test (full suite) + bun run typecheck, and bun run src/cli.ts check docs to confirm no false positives on this repo's own docs bundle (which links to a .ts file from an ADR).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: added a closed KNOWN_ASSET_EXTENSIONS set to src/core/links.ts (images/documents/data-config/archives/media/source-code extensions) and changed lacksMarkdownSuffix to flag any dotted last-segment whose extension is NOT on that list as missing-extension (dropped .md suffix), instead of the old 'any dot at all = asset' rule. .png/.csv/.gitignore/.ts stay clean; orders.v2 now flags. Corrected the lacksMarkdownSuffix + validateLink doc comments to state the resolver/existence check does NOT catch this shape (bundle.ts/check.ts untouched, out of scope) -- the portability lint is the only mechanism left to catch it, and the two are no longer both silent for this shape.

Verification: added test/links.test.ts case for orders.v2 (bare + nested path). Mutation-check: reverted src/core/links.ts to HEAD (keeping the new test) -> test FAILS (received [] instead of ["missing-extension"]); restored the fix -> test PASSES. Full suite: bun test = 1846 pass / 0 fail across 47 files. bun run typecheck clean. Ran bun run src/cli.ts check docs against this repo's own real docs bundle before and after the change: 0 errors/0 warnings both times (KNOWN_ASSET_EXTENSIONS includes 'ts' specifically because docs/adr/0006 legitimately links straight at src/core/profile.ts / validate.ts, which would otherwise become a false positive).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the portability lint's lacksMarkdownSuffix (src/core/links.ts) so a dotted, extensionless concept link (orders.v2, meant for orders.v2.md) is flagged as a missing-extension finding instead of silently waved through as an asset. Replaced the old 'last segment has any dot at all -> asset' rule with a closed KNOWN_ASSET_EXTENSIONS allowlist; anything with a dot NOT on that list is presumed a dropped .md suffix. Corrected the lacksMarkdownSuffix/validateLink doc comments, which previously falsely claimed the broken-link existence check (bundle.ts/check.ts) catches this case -- it does not and remains untouched (out of scope), so the portability lint is now the sole, working mechanism for this shape. Verified via: (1) new regression test in test/links.test.ts for orders.v2, mutation-checked by reverting the src fix (test fails, [] vs expected [missing-extension]) and restoring it (test passes); (2) full suite bun test = 1846 pass/0 fail across 47 files; (3) bun run typecheck clean; (4) bun run src/cli.ts check docs against this repo's real docs/ bundle, 0 errors/0 warnings both before and after (confirms no new false positive against docs/adr/0006's legitimate .ts source-file links).
<!-- SECTION:FINAL_SUMMARY:END -->
