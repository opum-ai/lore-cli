---
id: LCLI-310
title: >-
  Close adverb-shaped prohibitions, ownership-without-prohibition, and the
  second hand-listed gate
status: Done
assignee:
  - '@claude'
created_date: '2026-08-04 14:50'
updated_date: '2026-08-04 14:56'
labels: []
dependencies: []
ordinal: 423000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A third owner correction names three loophole shapes this repository has instances of, one of them derived from the owner's own routing rule 8. An adverb can carry the prohibition, so 'report rather than silently promoting either' is satisfied by promoting one loudly. Ownership can be stated without the act being forbidden, so naming saws the DNS owner is satisfied while creating a record locally. A description can be prohibited while the artifact stays permitted, which the ownership reference still does for Quest even though CLAUDE.md was corrected. The owner also asks every repository that wrote a gate from its notices to apply the literal-satisfaction test to the gate first, because a defective sentence misleads a reader while a defective gate issues a certificate: this repository still has a second hand-maintained file list guarding the stale package identity, with the same false-clear shape as the document list already fixed. Grep is not sufficient for this sweep — the owner reports it missing a phrase that wrapped across two lines in an already-read file — so the records must be read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No rule in this repository places the prohibition in an adverb; each forbids the act itself, so a reader cannot satisfy it by doing the forbidden thing openly
- [x] #2 Every statement of another repository's ownership is paired with the act this repository is forbidden to perform, including the hard negative that no repository other than saws creates, modifies, or deletes a DNS record in any zone, for any provider, including preview and ephemeral hostnames
- [x] #3 No rule prohibits describing something while leaving the artifact permitted; the Quest rule in the documentation ownership reference prohibits creating the resolving artifact as CLAUDE.md already does
- [x] #4 The stale package-identity gate enumerates tracked files rather than a curated list, so a new file carrying a superseded package name or repository slug fails the gate instead of passing unexamined
- [x] #5 Every scanning gate asserts non-vacuity so an empty or mis-globbed run fails, and each is proven by a negative control that makes it fail and name the offending path
- [x] #6 Any exemption a gate grants is explicit, individually justified in the code, and asserted so that adding one is a visible change rather than a silent widening
- [x] #7 Records note that every estate repository is private, so a cross-repository GitHub link is access-gated rather than a destination
- [x] #8 lore validate --strict, lore check, and the full repository-location gate pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the two records end to end rather than grepping them, because the owner reports grep missing a line-wrapped instance in an already-read file.
2. Replace both adverb-shaped prohibitions with the act itself, and leave the conflict standing until an owner resolves it rather than authorizing either promotion.
3. Pair every ownership statement with the act forbidden here, stating the saws DNS hard negative outright.
4. Fix the Quest rule in the ownership reference so it prohibits the resolving artifact, matching CLAUDE.md.
5. Replace the hand-listed package-identity gate with an enumeration of tracked files, carrying explicit per-file provenance exemptions that are themselves asserted so a silent widening fails.
6. Add non-vacuity assertions to every scanning gate and prove each with a negative control that must fail and name the offending path.
7. Record the estate-wide access-gated link rule and add the new loophole shapes to the rule-writing guidance.
8. Verify with lore validate --strict, lore check, and the full gate, then report findings to the owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sweep result for the third correction: all three prose shapes were present, and the gate shape was present a second time.

Adverb carrying the prohibition — two instances, both derived from the owner's routing rule 8 before it was corrected. CLAUDE.md and the ownership reference each said 'report the divergence rather than silently promoting either', satisfiable by promoting one loudly. Both now forbid promoting either side, quietly or openly, and require leaving the conflict standing until an owner resolves it. Reading found no third instance; grep was not trusted for this pass after the owner reported it missing a line-wrapped phrase in an already-read file.

Ownership without the act forbidden — two instances. CLAUDE.md routed infrastructure questions to saws and said an infrastructure change is not real until saws reflects it, which a reader satisfies by creating a record locally and accepting that it is not 'real'. The ownership reference's saws row said only to record local obligations and link to the owner. Both now state the hard negative outright, and CLAUDE.md says explicitly that the prohibition binds this repository.

Description forbidden while the artifact stayed permitted — one instance, and a miss from the previous round worth owning: LCLI-309 fixed this in CLAUDE.md but left the identical defect in the ownership reference's Quest row, which still said only 'never describe Quest as installable'. Fixing one instance of a shape is not fixing the shape.

Second hand-listed gate — PACKAGE_OPERATIONAL_FILES guarded the superseded @salient-data/lore identity across seventeen curated files, the same false-clear structure as the document list fixed last round. Replaced with a scan of every tracked file outside backlog/, covering the superseded package name and all three superseded repository slugs. Three provenance exemptions are individually justified in code: CHANGELOG.md for superseded release history, ADR-0001 for its decision-time repository, and this test for defining the identifiers it searches. The exemption set is pinned by assertion, so adding a fourth is a visible failure rather than a silent widening.

Both scanning gates were proven rather than assumed. The tracked-file gate failed on a staged src/tmp-negative-control.ts and reported 'src/tmp-negative-control.ts: @salient-data/lore', naming both path and identity. The exemption pin was proven separately by adding a fourth entry, which failed and named it. Both controls were reverted and the suite re-run clean. One honest limitation is documented in the code: git ls-files sees only tracked files, so a brand-new unstaged file is invisible to that gate — exact in CI where the tree is always committed, and covered locally because the document scan reads the filesystem instead.

Also recorded the estate-wide rule that every repository is private, so a cross-repository GitHub link is access-gated rather than a destination and must not appear on a public surface, and added all four loophole shapes plus the gate standard — enumerate, assert non-vacuity, pin exemptions, prove with a negative control — to the rule-writing guidance.

Verification: repository-location 8/8 with 105 assertions plus three negative controls; full suite 2436 tests, 0 failures, 8151 assertions; lore validate --strict 64 files 0 errors 0 warnings; lore check exit 0; biome clean on the changed test; tsc clean. Commit 913a04c on dev, not pushed. The Codex agent's LCLI-302 work had landed as 2191eeb, so the full suite is green rather than partially contended as in the previous two rounds.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed all three loophole shapes from the third owner correction, plus a second instance of the gate shape.

Two adverb-carrying prohibitions derived from the owner's pre-correction routing rule 8 now forbid the act: neither record permits promoting a side of a drift conflict, quietly or openly, and both require leaving it standing until an owner resolves it. Two ownership statements that named saws without forbidding anything now carry the hard negative that no repository other than saws creates, modifies, or deletes a DNS record in any zone, for any provider, preview and ephemeral hostnames included, with CLAUDE.md stating that this binds this repository. The ownership reference's Quest rule, which LCLI-309 fixed in CLAUDE.md but missed here, now prohibits the resolving artifact rather than the description.

The stale package-identity gate no longer runs against seventeen curated files. It scans every tracked file outside backlog/ for the superseded package name and all three superseded repository slugs, with three individually justified provenance exemptions whose set is pinned so a fourth fails visibly.

Verified by proof rather than assumption: the tracked-file gate was made to fail on a staged control and named both the offending path and the identity it carried; the exemption pin was made to fail on an added entry; both controls were reverted. Repository-location passes 8/8 with 105 assertions, the full suite passes 2436 tests with 8151 assertions and zero failures, lore validate --strict reports 64 files with 0 errors, lore check exits 0, and biome and tsc are clean on the changed files.

Records now state that every estate repository is private, so a cross-repository link is access-gated rather than a destination, and the rule-writing guidance names all four loophole shapes and the gate standard: enumerate rather than list, assert non-vacuity, pin exemptions, prove with a negative control.
<!-- SECTION:FINAL_SUMMARY:END -->
