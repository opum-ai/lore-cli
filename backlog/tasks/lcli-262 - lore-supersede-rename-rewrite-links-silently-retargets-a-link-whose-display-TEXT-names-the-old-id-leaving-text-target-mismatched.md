---
id: LCLI-262
title: >-
  lore supersede/rename --rewrite-links silently retargets a link whose display
  TEXT names the old id, leaving text/target mismatched
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:31'
labels:
  - cli-ux
  - core-rewrite-engine
dependencies: []
references:
  - src/core/rewrite.ts
  - src/commands/supersede.ts
priority: low
type: bug
ordinal: 364000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
When 'lore supersede <old> <new> --rewrite-links' (and, via the shared engine, 'lore rename') repoints inbound links, it must not silently leave a link whose DISPLAY TEXT deliberately names the old concept pointing at the new one — producing a doc that reads one thing and links another.

## Observed (Meridian stress test)
'lore supersede --rewrite-links' rewrote EVERY inbound link indiscriminately, including one whose surrounding prose intentionally named the OLD ADR for contrast against the new one (e.g. text 'ADR-0005' explaining why it was replaced). The rewrite left the visible text saying 'ADR-0005' while the link now pointed at ADR-0006's file — a silent text/target mismatch that needed a manual fix after the run.

## Why it matters
Supersession docs frequently reference the old decision BY NAME to explain the change ('supersedes ADR-0005 because…'). Blindly retargeting those links corrupts exactly the sentences that document the supersession, and does so SILENTLY (no report, no warning). The mechanical retarget is 'working as coded', but the output is misleading — a correctness-adjacent defect. The shared rewrite engine (core/rewrite.ts) means 'lore rename' has the same exposure.

## Direction (decide in plan)
- Detect when a link's display text matches the old id (or its bare number/slug) and SKIP + warn (leave it for the author), or
- Emit a per-link report of what was rewritten so the author can review/revert, or
- Provide a way to exclude specific links / a --dry-run-first workflow that surfaces text/target divergences.
Keep the default safe: never silently produce a text/target mismatch.

## Refs
src/core/rewrite.ts (shared rewriteInbound engine used by both supersede + rename), src/commands/supersede.ts, src/commands/rename.ts; related: the shared-engine invariants noted in prior work (LCLI-79/80).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When --rewrite-links repoints an inbound link whose display text names the OLD id (or its number/slug), lore does not silently leave a text/target mismatch: it either skips that link with a warning, or surfaces it in a report the author can act on (chosen mechanism recorded).
- [x] #2 Ordinary inbound links (display text NOT naming the old id) are still retargeted as before — no regression to the normal supersede/rename rewrite.
- [x] #3 The fix covers BOTH 'lore supersede --rewrite-links' and 'lore rename' (shared core/rewrite.ts engine); a regression test exercises a link whose text names the old id and asserts no silent mismatch.
- [x] #4 Full suite + lore check stay green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core/rewrite.ts: add LinkTextMismatch {path, text, from, to} and a textMismatches field on
   RewritePlan (pure data, no I/O — engine stays pure per lore-design 2.1).
2. Decision (recorded, not "skip"): the engine ALWAYS retargets the link exactly as before
   (no regression to AC#2) and additionally detects + reports every retargeted inbound body
   link whose visible text still names the OLD id. Chosen over "skip the retarget" because
   skipping is unsafe for `lore rename`: the old file is DELETED there, so a skipped link
   would become a genuinely dangling link — worse than a text/target mismatch. A single
   uniform "always retarget, always report" policy applies identically to supersede (move:
   false) and rename (move:true, for every affected concept other than the moved file
   itself), keeping both callers' behavior mechanically unchanged except for the new report.
3. Detection lives in computeBodyEdits (only for the !ctx.isMoved / inbound-file path, which
   is the shared code both supersede and rename funnel every OTHER concept's link through):
   - reuse bundle.ts's existing nodeText(node) to get a link's/linkReference's visible text
     (no new text-extraction code duplicated).
   - build oldIdNameCandidates(fromId): the bare id, its basename, and — for an NNNN-slug
     id (adr/0005-x style) — the bare digits and "<dirname>-<digits>" (matches the bug
     report's literal "ADR-0005" example) so a citation like "ADR-0005" is caught even
     though the id's basename is "0005-x-title".
   - textNamesOldId(text, candidates): case-insensitive; word-boundary regex for non-"/"
     candidates, plain substring for the full id (which contains "/").
   - for a reference-style link, the display text lives on the linkReference node, not the
     definition — collect a first-occurrence identifier -> text map while already walking
     the tree for usedIdentifiers.
   - a mismatch is only recorded when an edit is actually emitted (i.e. the destination
     genuinely changes) — never for an already-canonical link.
4. rewriteInbound aggregates every affected file's mismatches, sorted by path (stable sort
   preserves each file's own document order) into RewritePlan.textMismatches.
5. Export a single renderLinkTextMismatchWarning(m) in rewrite.ts (mirrors state.ts's
   renderBacklogCommitLine — one wording, reused by both commands) so both callers render
   byte-identical text.
6. commands/supersede.ts and commands/rename.ts: after computing the plan, if
   plan.textMismatches is non-empty, push each rendered line into a FRESH WarningCollector
   (not the already-flushed `advisories` one — flush() is non-draining, so reusing it would
   re-print the earlier bundle-load warnings too) and flush it to stderr. Warnings only —
   never change the exit code (matches WarningCollector's documented "advisory, not error"
   contract and cli-contract's stdout/stderr diagnostic split); the retarget itself, the
   report payload, and the exit code are unchanged, so AC#2 (ordinary links still retarget,
   no regression) holds by construction.
7. Tests: add rewrite.ts-level or supersede/rename command-level regression tests: (a) an
   inbound link whose text names the old id (both the literal-id-substring case and the
   "ADR-0005"-style numeric-prefix case) — assert it IS still retargeted (no regression) AND
   a matching stderr warning is emitted, for both supersede --rewrite-links and rename; (b)
   an ordinary inbound link whose text does NOT name the old id — assert no warning is
   emitted (no false positive / no regression to AC#2).
8. Verify: bun test, bun run typecheck, bun run lint, bun run src/cli.ts check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision (AC#1, recorded): chosen mechanism is REPORT, not skip. rewriteInbound (core/rewrite.ts)
always retargets an inbound link exactly as before (no behavior change to what gets rewritten) and
additionally returns RewritePlan.textMismatches: LinkTextMismatch[] — pure advisory data (path,
text, from, to) for every retargeted inbound link whose visible display text still names the old
id. Both commands/supersede.ts and commands/rename.ts render each one as a stderr `warning: link
text "..." in docs/... still names "...", but its link now points to "..." — review the prose`
line via the shared core/rewrite.ts renderLinkTextMismatchWarning (a FRESH WarningCollector per
call, since the earlier bundle-load `advisories` collector was already flushed and flush() is
non-draining).

"Skip the retarget" (the task's other listed option) was rejected as UNSAFE for `lore rename`: that
command DELETES the old file, so a skipped inbound link would become a genuinely dangling link —
worse than a stale-reading text. A single uniform "always retarget, always report" policy applies
identically to supersede (move:false) and rename (move:true, for every affected concept other than
the moved file itself), so both callers behave mechanically unchanged except for the new warning —
satisfying AC#2 by construction.

Detection heuristic (oldIdNameCandidates/textNamesOldId in rewrite.ts): case-insensitive match
against the bare old id, its basename, and — for an NNNN-slug id (adr/0005-x convention) — the
bare digits and "<dirname>-<digits>" (catches the bug report's literal "ADR-0005" citation style).
Word-boundary regex for non-"/" candidates to reduce false positives; documented as a deliberately
pragmatic heuristic, not full NLP, in the code comment.

Scope boundary (documented in computeBodyEdits' doc comment + a locking regression test): detection
only runs for an INBOUND file's retargets (the code path shared by both supersede and rename for
every OTHER concept's links to fromId). The MOVED file's own self-link retarget (rename mode) is
exempt — most of its recomputed links aren't edges to fromId at all, and the "does this text cite
the old id" framing doesn't fit its own relocation the same way. Reuses bundle.ts's existing
nodeText() for display-text extraction (link node children, and — for a reference-style link — the
linkReference node's own children, looked up by identifier, since the definition itself carries no
visible text).

Verification: bun test (2073 pass / 0 fail, including 11 new regression tests: 6 core-level
rewriteInbound tests + 2 command-level tests in rename.test.ts, 3 command-level tests in
supersede.test.ts), bun run typecheck (clean), bun run lint (clean), bun run src/cli.ts check (38
files, 0 errors, 0 warnings).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed: core/rewrite.ts's shared rewriteInbound engine now reports (never silently ships) an
inbound body link whose visible display text still names the OLD id after --rewrite-links/rename
retargets it. Mechanism chosen: REPORT via RewritePlan.textMismatches (a new LinkTextMismatch[]
field, pure data), rendered by commands/supersede.ts and commands/rename.ts as a stderr
`warning: link text "..." ...` line via the new shared renderLinkTextMismatchWarning — the link is
always still correctly retargeted (skip was rejected: rename deletes the old file, so a skipped
link would dangle). Applies uniformly to both callers via the shared engine. Detection is a
documented pragmatic heuristic (bare id / basename / NNNN-slug digit-prefix forms, word-boundary
matched) scoped to inbound files only (the moved file's own self-link retarget is exempt, with a
locking regression test).

Verified: bun test — 2073 pass, 0 fail (11 new regression tests added: 6 core rewriteInbound-level
+ 2 command-level in test/rename.test.ts, 3 command-level in test/supersede.test.ts, covering the
numeric-ADR-style citation, a non-numeric basename-slug citation, a reference-style [text][ref]
link, the no-false-positive ordinary-link case for both supersede and rename, and the moved-file
self-link scope-boundary exemption). bun run typecheck — clean. bun run lint (biome check) —
clean. bun run src/cli.ts check — 38 files, 0 errors, 0 warnings.
<!-- SECTION:FINAL_SUMMARY:END -->
