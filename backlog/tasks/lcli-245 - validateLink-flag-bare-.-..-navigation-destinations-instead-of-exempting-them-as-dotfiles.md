---
id: LCLI-245
title: >-
  validateLink: flag bare '.'/'..' navigation destinations instead of exempting
  them as dotfiles
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - core-links-resolution
  - codex-review-followup
  - links
  - check
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: bug
ordinal: 347000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `validateLink` (src/core/links.ts) should report a portability finding for an internal link destination that is, or ends in, a bare `.` or `..` navigation segment (`.`, `..`, `../..`, `foo/..`, `foo/.`), instead of returning zero findings as it does today.

**Why:** these navigation-only destinations point at a directory, not the canonical `.md` file the link form requires, and they do not resolve consistently across the four target consumers (GitHub browses to the directory, but Obsidian will not resolve a `..` to a note). They currently slip through both guards: `isDirectoryLink` (live src/core/links.ts:508-511) only matches a trailing `/`, and the dotfile exemption in `lacksMarkdownSuffix` (live src/core/links.ts:436, `last === "" || last.startsWith(".")`) treats a final segment of exactly `.`/`..` as a real dotfile like `.gitignore` and exempts it. Confirmed live: `validateLink(".")`, `validateLink("..")`, `validateLink("../..")`, `validateLink("foo/..")`, `validateLink("foo/.")` all return `[]`. The intent of the `startsWith(".")` branch is to exempt genuine dotfiles (`.gitignore`), not `.`/`..` path-navigation segments.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity finding, cluster core-links-resolution. Original citation src/core/links.ts:358; the described behavior lives in `lacksMarkdownSuffix` / `isDirectoryLink`. Whether the emitted finding is `directory-link` or `missing-extension` is left to the implementer — either existing `LinkIssue` kind is acceptable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `validateLink(".")` returns a non-empty LinkFinding[] (at least one finding).
- [x] #2 `validateLink("..")` returns a non-empty LinkFinding[].
- [x] #3 A destination whose final path segment is exactly `.` or `..` (`../..`, `foo/..`, `foo/.`) returns a non-empty LinkFinding[].
- [x] #4 A genuine dotfile link (`../config/.gitignore`) still returns `[]` — no regression to the dotfile exemption.
- [x] #5 A canonical `.md` link (`../reference/orders.md`) and a recognized asset link (`../img/x.png`) still return `[]`.
- [x] #6 New/updated unit tests in test/links.test.ts cover the above cases and `bun test test/links.test.ts` passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read src/core/links.ts around lacksMarkdownSuffix/isDirectoryLink to understand current logic.
2. Add a helper (or inline check) that detects when the FINAL path segment of a destination is exactly '.' or '..' (navigation-only), distinct from a genuine dotfile like '.gitignore'.
3. Update lacksMarkdownSuffix's dotfile exemption so it no longer exempts bare '.'/'..' segments -- only real dotfiles (name starts with '.' and has more than just dots).
4. Ensure isDirectoryLink or the missing-extension path still flags these correctly, reusing existing LinkIssue/LinkFinding kind (directory-link or missing-extension).
5. Add/extend tests in test/links.test.ts for validateLink('.'), ('..'), ('../..'), ('foo/..'), ('foo/.') -> non-empty; ('../config/.gitignore') -> []; ('../reference/orders.md') and ('../img/x.png') -> [].
6. Run bun test test/links.test.ts, full bun test, bun run typecheck, and biome check on changed files.
7. Finalize backlog task and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: isDirectoryLink (src/core/links.ts) now also flags a final path segment of exactly '.'/'..' as a directory link (in addition to the existing trailing-'/' check), which runs BEFORE lacksMarkdownSuffix's dotfile exemption -- so the dotfile check itself is untouched and never has to distinguish '.'/'..' from a real dotfile. Updated the directory-link JSDoc/message text to mention the new bare-navigation shape. Verified live via a scratch script: validateLink('.'), ('..'), ('../..'), ('foo/..'), ('foo/.') all return a non-empty ['directory-link'] finding (AC1-3); ('../config/.gitignore') still [] (AC4, dotfile exemption intact); ('../reference/orders.md') and ('../img/x.png') still [] (AC5). Added 5 new tests to test/links.test.ts covering all of the above (AC6). bun test test/links.test.ts: 91 pass/0 fail. Full bun test: 1994 pass/0 fail. bun run typecheck: clean. bunx biome check src/core/links.ts test/links.test.ts: clean (0 errors after biome --write reformatted one test.each array literal).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed validateLink's directory-link guard (isDirectoryLink in src/core/links.ts) to also match a final path segment of exactly '.' or '..' (bare/trailing navigation: '.', '..', '../..', 'foo/..', 'foo/.'), not just a trailing '/'. Because isDirectoryLink is checked before lacksMarkdownSuffix's dotfile exemption in validateLink, these navigation-only destinations are now caught as directory-link findings without touching the dotfile exemption itself -- a genuine dotfile link (../config/.gitignore) still returns []. Canonical .md links and recognized asset links are unaffected. Verified with 5 new tests in test/links.test.ts plus a live scratch-script check of all AC cases; full bun test (1994 pass/0 fail), bun run typecheck (clean), and biome check on both changed files (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
