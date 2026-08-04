---
id: LCLI-311
title: 'Make the loophole guidance a general rule, not a curated list of shapes'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-04 15:01'
updated_date: '2026-08-04 15:05'
labels: []
dependencies: []
ordinal: 424000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The fourth owner correction reports two shapes this repository has not accounted for, and one of them is the guidance itself. The rule-writing section closes with four named loophole shapes and tells a reader each is worth checking by name — a curated list wearing the clothes of a general rule, authored one round after the curated-list defect was the finding. Two further shapes arrived immediately, which is the proof: a reader who checks the four and finds none concludes clean while the record is not. The second shape is a gate that reports a pipeline's exit status rather than the tool's, which this session committed once when citing a validate exit code taken from a piped tail. Restate the guidance so the literal-satisfaction test is the rule and the shapes are explicitly non-exhaustive examples, add both new shapes, and record that a fix is itself an authoring event subject to the same test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The rule-writing guidance states the literal-satisfaction test as the rule and marks the shape list explicitly non-exhaustive, so finding none of the listed shapes is not recorded as a clear
- [x] #2 The guidance names the piped-exit-code shape and requires a real exit code taken without a pipe, plus a negative control proving the gate can fail
- [x] #3 The guidance records that closing a loophole is an authoring event: the sentence written to close one is subject to the same test, and a full-set replacement re-authors every element including those not being changed
- [x] #4 Any gate whose scope is narrower than the repository says so, so a directory-scoped scan is not read as a repository-wide guarantee
- [x] #5 lore validate and lore check exit codes are verified unpiped, and lore check is proven by a negative control that makes it exit 6 and name the offending path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Restate the rule-writing guidance so the literal-satisfaction test is the rule and the shape list is an explicitly non-exhaustive record of what has already been found here, with finding none of them stated not to be a clear.
2. Add the two new shapes: a gate reporting a pipeline's exit status rather than the tool's, and the fix itself being an authoring event, including that a full-set replacement re-authors every element.
3. Narrow the overselling name and comment on the documentation-scoped gate so it is not read as the repository-wide guarantee, which the tracked-file gate provides.
4. Verify exit codes unpiped and prove lore check with a negative control.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Sweep result for the fourth correction: one real self-inflicted defect, one confirmed reporting defect, and two shapes checked clean.

The reporting defect is mine and is owned rather than explained away. Early in this session I cited 'validate exit: 0' from 'lore validate --strict --plain 2>&1 | tail -15; echo $?', which is tail's status, not lore's. Every later gate call in the session used redirection ('>/dev/null 2>&1; echo $?'), which is correct, and one intermediate call using PIPESTATUS printed an empty value and was immediately re-run unpiped — so only that one citation was worthless. Re-run unpiped now: validate 0, check 0, repository-location 0, biome 0, typecheck 0, full suite 0 with 2436 tests and 8151 assertions.

lore check is now proven rather than trusted. A temporary Reference with a deliberate dangling link made it exit 6 and report 'error reference/tmp-check-control.md [broken-link]: link "./definitely-does-not-exist.md" points at "reference/definitely-does-not-exist.md", which is not in the bundle' — naming both the containing file and the offending target — returning to exit 0 after removal.

The real find is that the remediation was the shape it closed. LCLI-310's guidance ended with four named loophole shapes and told a reader each was worth checking by name: a curated list wearing the clothes of a general rule, authored one round after the curated-list defect was the finding. This correction then delivered two more shapes, which is the proof — checking the four and finding none would have read as clean. The literal-satisfaction test is now stated as the rule, the list is marked a non-exhaustive record with finding none of them explicitly not a clear, and both new shapes are added, including that a full-set replacement re-authors every element and that fixing one instance of a shape is not fixing the shape.

A gate whose scope oversold its name was corrected: 'no documentation file anywhere cites a former-org CLI route' scans markdown on disk only, which is the directory-scoped-sweep shape. It is renamed to 'no markdown file on disk', with a comment stating that the repository-wide guarantee is the tracked-file gate and that this one adds only the ability to see an unstaged file.

Two checks came back clean. A whole-repository, whitespace-normalized sweep for adverb-carrying prohibitions returned 108 candidates, all of which are descriptions of implemented program behavior ('fails loud rather than silently mis-parsing') rather than prohibitions addressed to a reader; the two governance instances fixed in LCLI-310 no longer appear, confirming that fix. CI action pins were checked for superseded orgs after lore-doc's finding: every 'uses:' is an official 'actions/*' plus one local './.github' composite, and README pins the composite at opum-ai/lore-cli, so there is no stale-org pin here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Turned the loophole guidance from a checklist back into a rule, after the previous round's remediation turned out to carry the shape it was closing.

LCLI-310 ended with four named loophole shapes and told a reader each was worth checking by name. That is a curated list wearing the clothes of a general rule, and two further shapes arrived the same day — so a reader checking the four and finding none would have recorded a clear that was not one. The literal-satisfaction test is now stated as the rule, and the list is explicitly a non-exhaustive record of shapes already found here, with finding none of them stated not to be a clear.

Both new shapes are recorded: a gate reporting a pipeline's exit status rather than the tool's, and the fix not being exempt — closing a loophole is an authoring event, a full-set replacement re-authors every element including those the edit was not about, and fixing one instance of a shape is not fixing the shape. The gate standard gains the real-exit-code requirement and an instruction to declare a scope narrower than the repository, and the markdown scan was renamed to what it actually covers with the tracked-file gate named as the repository-wide guarantee.

Verified with unpiped exit codes throughout, correcting this session's one piped citation: validate 0, check 0, repository-location 0, biome 0, typecheck 0, and the full suite 0 across 2436 tests and 8151 assertions. lore check was additionally proven by a negative control that made it exit 6 and name both the containing file and the dangling target, returning to 0 after cleanup.
<!-- SECTION:FINAL_SUMMARY:END -->
