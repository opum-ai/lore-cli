---
id: LCLI-361
title: >-
  docs/index.md still cites @opum-ai/lore@0.3.0 while 0.3.4 is the published
  version
status: Done
assignee:
  - '@claude'
created_date: '2026-08-28 23:59'
updated_date: '2026-08-29 23:44'
labels:
  - docs
  - release
  - drift
dependencies: []
ordinal: 488000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The root index's opening paragraph (docs/index.md:20) says lore is "released on npm as `@opum-ai/lore@0.3.0`", and line 59 describes the release-truth reference as carrying evidence "for `0.3.0`". The registry returned `@opum-ai/lore` at 0.3.4 unauthenticated on 2026-08-28, and LCLI-355 settled the 0.3.4 release with a published GitHub Release.

This is the first paragraph a reader — human or agent — sees in the bundle, so a stale version there is the most-read wrong fact in the docs. Noticed during LCLI-358.3 and deliberately left alone rather than fixed opportunistically inside an unrelated change.

Worth deciding once, not patching each release: whether that sentence should name a version at all, or point at the release-truth reference and let that one file carry the number. A version pinned in prose is a fact that goes stale on every release; a pointer does not.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/index.md no longer states a version that disagrees with the published package
- [x] #2 The approach is decided explicitly — either the index cites the current version and a release step updates it, or it points at docs/reference/lore-cli-release-truth.md instead of naming one
- [x] #3 lore check passes and any other in-bundle citation of the published version agrees
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed 2026-08-29.

AC#2 -- the decision, made explicitly rather than patched. docs/index.md now names NO version. It points at docs/reference/lore-cli-release-truth.md, which becomes the one file in the bundle carrying the current published number. The task offered two options; the pointer wins because a version written into prose is a fact that goes stale on every release, and this is the first paragraph a human or agent meets, so a wrong number there is the most-read wrong fact in the bundle. A release step that updates it would work only for as long as nobody forgets.

AC#1 -- both stale sites in docs/index.md are gone. Line 20's '@opum-ai/lore@0.3.0' is now an unversioned npm link plus the pointer; line 59's 'evidence for 0.3.0' now reads 'for the current published release' and carries the standing instruction that the index names no version.

AC#3 -- swept the whole bundle rather than the two known lines: grep -rn --include='*.md' -E '@opum-ai/lore@[0-9]' over docs/. Only docs/index.md made a current-state claim. Two other hits survive and are legitimate, and both are now pinned as named exemptions rather than waved through by directory:
- docs/runbooks/release-publishing.md:105 -- the 0.1.0 post-publish smoke result, a dated checklist about one past release.
- docs/adr/0020:36 -- the 0.3.4/0.2.9 pairing that motivated the floor. This one WAS defective in the CLAUDE.md 'say then-current, never current' sense: it said '0.3.4 and 0.2.9 ... is what a user installing today actually gets', which becomes false the moment 0.3.5 ships. Rewritten to 'as observed on 2026-08-28 ... what a user installing on that date actually got'. A dated observation stays true permanently.
docs/log.md and docs/stories/ hits are commit-log and past-release records, correctly historical.

Standing guard added to docs/runbooks/release-publishing.md step 3, so the next releaser does not helpfully re-add a version: the index names none deliberately, release-truth is the single file to update, and the sweep is re-run before finishing a release.

The gate's design was corrected once during authoring. My first version exempted 'a hit inside docs/log.md, docs/stories/, or an ADR' -- a directory-scoped exemption, which is the hand-scoped-list shape CLAUDE.md warns about, and it would have waved through exactly the ADR-0020 defect found minutes later. It now classifies by what the SENTENCE claims (does it assert what is published now, undated?), and pins its two exemptions individually with the justification for each, so a third hit is a visible failure.

Negative control run 2026-08-29, because a gate never observed failing is not known to work: a planted '@opum-ai/lore@9.9.9' line in docs/reference/cli-surface.md was reported by path and line number, and the sweep returned to exactly its two pinned rows once removed. Recorded in the runbook.

Validation: lore check exit 0, lore validate --strict exit 0, both taken without a pipe.
<!-- SECTION:NOTES:END -->
