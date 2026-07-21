---
id: LORE-88
title: >-
  rewriteInbound (rename / supersede --rewrite-links) re-serializes and
  re-parses concepts against the built-in default profile, not the project's
  custom one
status: To Do
assignee: []
created_date: '2026-07-21 18:52'
labels:
  - backlog-campaign-followup
  - correctness
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
priority: medium
type: bug
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
core/rewrite.ts's rewriteInbound — the shared engine behind `lore rename` and `lore supersede --rewrite-links` — has no `profile` parameter of its own. Its rewriteConcept() helper calls `serializeConcept(next)` with no options (rewrite.ts:318), and its caller falls back to `serializeConcept(concept)` with no options for a moved-but-textually-unchanged file (rewrite.ts:211); both therefore validate against `defaultProfile()` (concept.ts:357's `options.profile ?? defaultProfile()`) regardless of what profile the caller used to load the bundle. `commands/rename.ts`'s `buildPostRenameGraph` then re-parses those same rewritten bytes via `parseConcept(path, rewritten)` with no profile either (rename.ts:398/401) — the same default. `commands/supersede.ts`'s `--rewrite-links` path calls the identical `rewriteInbound` with no profile (supersede.ts:163-167), so any inbound (non-principal) concept whose link gets repointed hits the same gap.

This is a direct, previously-flagged consequence of LORE-84: that task fixed `loadBundle`'s own read path to honor a project's `.lore/profile.toml`, but its own implementation notes explicitly documented rewriteInbound's write/re-serialize path as a separate, adjacent gap left unfixed. Verified still present at dev HEAD (c8698a2): a scratch bundle whose custom profile redefines the built-in Story type's `tasks` field (default `kind = "list"`, custom `kind = "string"`) loads and queries cleanly (`lore query` succeeds, proving LORE-84's fix works for reads) — but `lore rename` and `lore supersede --rewrite-links` on a concept with an inbound link from a Story using the custom shape (`tasks: T-1`, a bare scalar) both exit 6 with "invalid Story frontmatter ... tasks: Invalid input: expected array, received string", rejecting a file that is fully valid under the project's own committed schema.

This is a genuinely new failure mode LORE-84 introduced, not a pre-existing one: before LORE-84, loadBundle/rewriteInbound/buildPostRenameGraph were all uniformly wrong (always defaultProfile()) but mutually consistent. After LORE-84, the initial load correctly validates against the real profile while rewriteInbound's internal re-serialize/re-parse still doesn't — so a rename/supersede on a project that reuses a built-in type name with an incompatibly-shaped field can pass the initial load and then throw later, mid-operation, against an unrelated file the caller has every reason to believe is valid. The failure happens before any file is written (rewriteInbound is pure, called before rename.ts's commitWrites), so there is no data-corruption or partial-write risk — but it is a hard, confusing block on a legitimate, self-consistent project's normal workflow, and the error message blames a file whose content is not actually the problem.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `lore rename` on a bundle whose custom `.lore/profile.toml` redefines an existing built-in type's field shape (e.g. Story.tasks as a scalar instead of a list) succeeds — without a spurious profile-mismatch validation error — when every concept involved, including one whose body link the rename repoints, is already valid per that custom profile.
- [ ] #2 `lore supersede --rewrite-links` on the same kind of bundle behaves the same way: repointing an inbound link in a concept whose frontmatter validates only under the project's custom profile does not throw.
- [ ] #3 core/rewrite.ts's own test suite exercises `rewriteInbound` directly (not only through rename.ts's/supersede.ts's command-layer tests) with a non-default profile passed explicitly, proving the engine's internal serialize call honors it rather than silently defaulting.
- [ ] #4 The bytes `rewriteInbound` serializes and the bytes any caller re-parses afterward (rename.ts's `buildPostRenameGraph`) are validated against the same profile the initiating command's `loadBundle` call used, so a rewritten concept can never be written under one profile and re-read under another.
- [ ] #5 A bundle using only the built-in default profile (the common case) sees no change in `rename`/`supersede --rewrite-links` behavior — this is a profile-threading fix, not a validation-strictness change.
<!-- AC:END -->
