---
id: LORE-245
title: >-
  validateLink: flag bare '.'/'..' navigation destinations instead of exempting
  them as dotfiles
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-links-resolution
  - codex-review-followup
  - links
  - check
dependencies: []
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
- [ ] #1 `validateLink(".")` returns a non-empty LinkFinding[] (at least one finding).
- [ ] #2 `validateLink("..")` returns a non-empty LinkFinding[].
- [ ] #3 A destination whose final path segment is exactly `.` or `..` (`../..`, `foo/..`, `foo/.`) returns a non-empty LinkFinding[].
- [ ] #4 A genuine dotfile link (`../config/.gitignore`) still returns `[]` — no regression to the dotfile exemption.
- [ ] #5 A canonical `.md` link (`../reference/orders.md`) and a recognized asset link (`../img/x.png`) still return `[]`.
- [ ] #6 New/updated unit tests in test/links.test.ts cover the above cases and `bun test test/links.test.ts` passes.
<!-- AC:END -->
