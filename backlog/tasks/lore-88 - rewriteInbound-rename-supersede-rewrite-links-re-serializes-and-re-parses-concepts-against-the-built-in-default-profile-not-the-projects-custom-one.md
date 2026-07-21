---
id: LORE-88
title: >-
  rewriteInbound (rename / supersede --rewrite-links) re-serializes and
  re-parses concepts against the built-in default profile, not the project's
  custom one
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 18:52'
updated_date: '2026-07-21 21:02'
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
- [x] #1 `lore rename` on a bundle whose custom `.lore/profile.toml` redefines an existing built-in type's field shape (e.g. Story.tasks as a scalar instead of a list) succeeds — without a spurious profile-mismatch validation error — when every concept involved, including one whose body link the rename repoints, is already valid per that custom profile.
- [x] #2 `lore supersede --rewrite-links` on the same kind of bundle behaves the same way: repointing an inbound link in a concept whose frontmatter validates only under the project's custom profile does not throw.
- [x] #3 core/rewrite.ts's own test suite exercises `rewriteInbound` directly (not only through rename.ts's/supersede.ts's command-layer tests) with a non-default profile passed explicitly, proving the engine's internal serialize call honors it rather than silently defaulting.
- [x] #4 The bytes `rewriteInbound` serializes and the bytes any caller re-parses afterward (rename.ts's `buildPostRenameGraph`) are validated against the same profile the initiating command's `loadBundle` call used, so a rewritten concept can never be written under one profile and re-read under another.
- [x] #5 A bundle using only the built-in default profile (the common case) sees no change in `rename`/`supersede --rewrite-links` behavior — this is a profile-threading fix, not a validation-strictness change.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed fresh against current dev HEAD before implementing (line numbers matched the
filing task's citations for rewrite.ts:211 and rename.ts:398/401/supersede.ts:163-167 exactly;
rewrite.ts:318 had drifted to 363, since LORE-95 added ~45 lines earlier in this same file):
core/rewrite.ts's rewriteInbound had no profile parameter -- its rewriteConcept helper's
serializeConcept(next) call (rewrite.ts:363) and the moved-but-unchanged fallback
serializeConcept(concept) (rewrite.ts:211) both always validated against defaultProfile().
commands/rename.ts's buildPostRenameGraph then re-parsed those same rewritten bytes via
parseConcept(path, rewritten) with no profile either (rename.ts:398/401) -- the same default.
commands/supersede.ts's --rewrite-links path called the identical rewriteInbound with no profile
(supersede.ts:163-167). A pre-existing comment at rename.ts:141-146 explicitly documented this as
a known, deliberately-deferred gap left by LORE-84.

Fix: added an optional `profile?: Profile` field to RewriteInboundOptions (core/rewrite.ts),
threaded into BOTH internal serializeConcept calls via a new profile parameter on the private
rewriteConcept helper -- passed through undefined-safe (serializeConcept's own `options.profile ??
defaultProfile()` fallback handles the unset case, mirroring how core/bundle.ts's loadBundle
already threads options.profile without eagerly resolving a default itself).

commands/rename.ts: hoisted the previously-inline `loadProfile({root: options.root})` into a named
`const profile` variable (was only ever passed anonymously into loadBundle before), then threaded
that SAME value into rewriteInbound's new profile option, into mergeIndexWrites (a new parameter,
since buildPostRenameGraph's call site lives inside that helper, not runRename itself -- an
implementation detail resolved by tracing the actual call chain, not assumed), and into
buildPostRenameGraph's own two parseConcept calls (AC#4: same profile instance writes and
re-reads). Removed the now-stale deferred-gap comment, replaced with one describing the fix.

commands/supersede.ts: reused its ALREADY-existing named `const profile` variable (no hoisting
needed there) at its own rewriteInbound call site.

AC#3: 4 new tests in a new "rewriteInbound -- custom profile (LORE-88)" describe block in
test/rename.test.ts, calling rewriteInbound directly (not through the command layer) with an
in-memory compileProfile(parseProfile(...)) redefining Story.tasks as a scalar string instead of
a list (the filing task's own repro shape) -- (1) confirms the bug reproduces when the graph is
profile-aware but rewriteInbound isn't given the profile; (2) confirms passing profile through
fixes it and the custom scalar shape survives re-serialize; (3) confirms move=false (supersede's
mode) honors it too; (4) confirms a plain default-profile bundle is unaffected (AC#5).

AC#1/AC#2: command-layer tests in test/rename.test.ts and test/supersede.test.ts driving the real
runRename/runSupersede with an ACTUAL .lore/profile.toml written to disk (complementary to the
engine-level tests -- these prove the command layer's own loadProfile-read-from-disk path
threads correctly end to end, not just the in-memory engine call).

Live-CLI verification (per this campaign's standing discipline): .repro-scratch/lore88-verify/,
driving the real `lore rename` CLI via `bun run src/cli.ts` against a real scratch bundle + real
.lore/profile.toml on disk. git stash comparison on the three source files: PRE-FIX, the identical
fixture failed exactly as the filing task's own repro describes -- exit 6, "invalid Story
frontmatter in stories/bulk.md: tasks: Invalid input: expected array, received string". POST-FIX
(stash pop), the identical command succeeds (exit 0), the inbound link is repointed, and the
custom scalar tasks: T-1 shape survives untouched in the rewritten file.

Verified: bun test -> 1688 pass/0 fail (up from 1682); bun run typecheck clean; bun run lint clean
on all changed files (fixed one biome organizeImports ordering issue in test/rename.test.ts) -- 4
pre-existing infos remain in unrelated files, untouched.
<!-- SECTION:NOTES:END -->
