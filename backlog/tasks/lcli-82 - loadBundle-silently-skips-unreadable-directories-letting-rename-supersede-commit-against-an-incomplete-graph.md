---
id: LCLI-82
title: >-
  loadBundle silently skips unreadable directories, letting rename/supersede
  commit against an incomplete graph
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:24'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a nested bundle directory loses read permission, loadBundle skips it during the walk with only an advisory warning. Mutation commands (rename, supersede) commit unconditionally regardless of that warning, so any inbound link from a concept inside the skipped directory is never rewritten, and the command still reports success while leaving stale/broken links behind.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A mutation command (rename, supersede) refuses to commit when loadBundle reported any skipped/unreadable directory, surfacing a clear error instead of silently proceeding
- [x] #2 A test covers an unreadable nested directory during a rename and asserts the command fails loudly rather than committing a partial rewrite
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirmed root cause: walkFiles (src/core/bundle.ts) already warns via WarningCollector when a nested directory is unreadable during the walk (tolerant by design -- one restricted folder doesn't abort the whole bundle load), but that warning is purely advisory free text with no machine-readable signal. rename.ts/supersede.ts's mutation commands never inspected it and committed writes unconditionally regardless, so a concept hidden inside the skipped directory that links to the renamed/superseded concept never gets its link rewritten, while the command still reports success.
2. Checked for existing precedent of command-layer code inspecting WarningCollector's list() content for decisions: none found (confirmed by grep) -- despite the class's own docstring claiming validate/check do this, they don't currently. WarningCollector is purely advisory/display-only today; any machine decision needs its own structured channel, not string-matching free text.
3. Extended WarningCollector (src/errors.ts) with an optional machine-readable kind tag on add() and a new has(kind) query method -- fully backward compatible (every existing .add(message) call site unchanged, kind is optional). Exported a UNREADABLE_DIRECTORY_WARNING kind constant from bundle.ts and tagged the existing unreadable-directory warning with it.
4. Added the refusal check to rename.ts (unconditional -- rewriteInbound's inbound-link rewrite always depends on graph completeness) and supersede.ts (gated on --rewrite-links specifically -- without that flag, supersede only edits the two principal concepts' own frontmatter, which has no dependency on the rest of the bundle being visible; checking unconditionally there would be an unjustified restriction for a scenario that can't actually happen). Both throw a validation LoreError (exit 6) naming the incomplete-graph problem, with a hint pointing at the specific warning above it.
5. Both commands previously flushed load advisories at the very END of the function (after already writing/committing) rather than right after loadBundle -- moved the flush earlier (mirroring context.ts/graph.ts's established pattern) so the specific 'skipping unreadable directory X: reason' line is visible when the new check throws, and removed the now-redundant late flush (WarningCollector.flush is non-draining, so leaving both would double-print the same warnings on the success path).
6. Added a test per command (rename.test.ts required by AC2; supersede.test.ts added for parity since AC1 explicitly names both) reproducing the exact scenario: a concept inside a chmod-000 nested directory links to the concept being renamed/superseded; asserts the command throws validation and that no partial write/rewrite was committed. Confirmed via git stash (isolating just the command file, keeping bundle.ts/errors.ts fixed) that both tests fail pre-fix (silent success) and pass post-fix.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design decision worth recording: chose a structured WarningCollector.has(kind) signal over string-matching the warning message text. Verified via grep that no existing command-layer code inspects .list()/.count for gating decisions today (WarningCollector's own docstring claims validate/check do this, but they don't -- stale documentation, not real precedent) -- so this establishes a NEW, reusable pattern (optional kind tag on add(), backward compatible) rather than following an established one. Future 'refuse to commit based on a specific advisory' needs can reuse the same has(kind) mechanism.

supersede.ts's check is gated on --rewrite-links specifically, NOT unconditional like rename.ts's -- without --rewrite-links, supersede only edits the two principal concepts' own frontmatter and has no dependency on graph completeness, so an unconditional check there would refuse a perfectly safe operation just because some unrelated directory elsewhere in the bundle happens to be unreadable. Verified this distinction by reading supersede.ts's own module docstring and code before implementing.

Both commands previously flushed load advisories at the very END of the function (after write/commit already happened) rather than right after loadBundle. Moved the flush earlier in both (mirroring context.ts/graph.ts's established early-flush pattern, used specifically so a load warning that explains a subsequent throw isn't lost) and removed the now-redundant late flush (WarningCollector.flush is non-draining -- leaving both would double-print warnings on the success path).

End-to-end verified with the real CLI (not just unit tests): a scratch bundle with a chmod-000 'locked/' directory containing a concept that links to the renamed concept. Pre-fix (git stash): lore rename exits 0, moves the file, reports success, while locked/linker.md's link is now permanently stale (the exact bug). Post-fix: exit 6, clear validation error, the specific 'skipping unreadable directory locked: ...' warning line visible, file never moved.

Added 2 tests (rename.test.ts required by AC2, supersede.test.ts added for parity per AC1 naming both commands). Confirmed via git stash (isolating just the command file with bundle.ts/errors.ts still fixed) both fail pre-fix with 'expected a LoreError, but run<Command> returned' (a genuine silent-success reproduction, not an unrelated failure) and pass post-fix.

Full bun test: 1514 pass/0 fail (up from 1512). bun run typecheck clean. bun run lint: 1 pre-existing info in supersede.test.ts (unrelated line, already present in the LCLI-83 session's lint baseline), none in changed lines.

Independent adversarial review (general-purpose subagent) confirmed correctness on every point: WarningCollector.has(kind) is exact-match with no false positive/negative risk (grepped all 18 .add() call sites in src/, none broken by the optional param); rename.ts's unconditional check is genuinely the only safe choice (no way to prove an unreadable subtree can't hide a link, correctly also fires under --dry-run since a misleading preview is still wrong); supersede.ts's --rewrite-links gating is sound (traced wireNew/resolveRef/assertNotAlreadySuperseded -- the non-rewrite-links path only touches the two already-validated principals, live-verified plain supersede succeeds even with the directory still locked while --rewrite-links on the same setup correctly refuses); the early-flush move is not just cosmetic but a genuine secondary bug fix -- previously ANY throw between loadBundle and the function's end (not just this new check) silently dropped load advisories entirely, since the only flush was after the final emit. Independently re-verified the git-stash-equivalent isolation and the live CLI end-to-end reproduction, all matching claims exactly.

One minor, non-blocking nitpick applied: WarningCollector's class docstring (untouched by my original diff) still claimed validate/check inspect count/list for gating, which the reviewer confirmed (again) is stale/inaccurate -- doubly so now that the real gating mechanism is the new has(kind). Fixed since I was already editing this class. Re-verified after the fix: bun test 1514/1514 pass, typecheck clean, lint clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a machine-readable kind tag to WarningCollector (src/errors.ts, backward compatible) and used it to mark loadBundle's existing 'skipping unreadable directory' warning (new UNREADABLE_DIRECTORY_WARNING constant, src/core/bundle.ts). lore rename now unconditionally refuses to commit when that warning fired (rewriteInbound's inbound-link rewrite always needs a complete graph); lore supersede refuses only when --rewrite-links is passed (without it, supersede's writes don't depend on graph completeness). Both throw a validation LoreError (exit 6) naming the problem, with the specific 'skipping unreadable directory X' warning flushed early enough to be visible alongside it (previously both commands flushed load advisories only at the very end, after already committing). Added a test per command reproducing the exact scenario (a linking concept hidden inside an unreadable directory); confirmed via git stash both silently succeed pre-fix and correctly refuse post-fix. End-to-end verified through the real CLI: pre-fix lore rename moved a file while permanently orphaning an inbound link with no error; post-fix it refuses at exit 6 with nothing written. Full bun test 1514/1514 pass (up from 1512), typecheck clean, lint clean (no new findings).
<!-- SECTION:FINAL_SUMMARY:END -->
