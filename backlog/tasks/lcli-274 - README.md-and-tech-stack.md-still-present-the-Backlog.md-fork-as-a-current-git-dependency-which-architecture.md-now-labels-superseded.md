---
id: LCLI-274
title: >-
  README.md and tech-stack.md still present the Backlog.md fork as a current git
  dependency, which architecture.md now labels superseded
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - docs-drift
  - adapter-backlog
dependencies: []
modified_files:
  - README.md
  - docs/reference/tech-stack.md
  - docs/index.md
  - docs/runbooks/dev-kickoff.md
priority: medium
type: bug
ordinal: 376000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
The repo's front-door docs should describe how lore actually consumes Backlog.md today — directly from upstream `MrLesk/Backlog.md` — not the superseded fork-as-git-dependency model.

## Observed
Found by the round-5 wave-2 **integration review** (the cross-task pass), not by any single-task reviewer.

`docs/reference/architecture.md` (approx. lines 130-136), rewritten by LCLI-270 this wave, now says explicitly: *"The 'Reads'/'Writes' bullets below also still describe the **pre-migration fork-based integration** (a compiled fork consumed as a git dependency) … both are superseded — `lore` now consumes upstream `MrLesk/Backlog.md` directly"*.

Two peer docs still assert the old model in the present tense, with no superseded banner:
- `README.md` approx. lines 44-48: *"So `lore` **forks** MrLesk/Backlog.md → `jeremy-newhouse/Backlog.md` … consumes the fork as a locally-compiled git dependency, and upstreams a minimal PR"*
- `docs/reference/tech-stack.md` approx. lines 398-402: *"**The fork dependency.** lore requires a `--json`-capable Backlog.md, which stock v1.47.1 lacks. We consume our fork (`jeremy-newhouse/Backlog.md`) as a **locally-compiled git dependency** during development"*

Ground truth contradicting both: `docker/e2e/Dockerfile` (approx. lines 49-52) clones `https://github.com/MrLesk/Backlog.md.git` at `BACKLOG_COMMIT=22a091b570d44c4f302ca47e7fd36fa28ad8bcb0`; `package.json` declares no Backlog dependency at all; and ADR-0002's 2026-07-17 amendment supersedes "fork Backlog.md ourselves".

## Why it matters
`README.md` is the repo front door and is npm-package-facing — it is the first thing a new consumer or contributor reads, and it currently tells them to expect a fork dependency that does not exist. The drift pre-dates this wave (`backlog-cli-contract.md` §2.2/§5 and `backlog-json-schema.md` §8 already contradicted it), but LCLI-270 corrected the third instance and modelled the fix, leaving these two as the last uncorrected present-tense assertions.

`docs/runbooks/backlog-json-patch.md` handles the same content correctly, with an explicit "Superseded (2026-07-17, LCLI-5)" banner — that is the pattern these two lack, and a ready-made precedent to follow.

## Direction (decide in plan)
Decide per-file whether the passage should be **corrected** (README — a reader needs the current model, not history) or **banner-superseded** in place (tech-stack.md may be documenting a historical decision). Follow `backlog-json-patch.md`'s existing banner convention rather than inventing a new one. Sweep for any further present-tense fork-dependency assertions rather than fixing only the two cited sites — this exact "corrected in one place, left standing in another" pattern is the campaign's most persistent defect class.

## Refs
`README.md` (approx. 44-48), `docs/reference/tech-stack.md` (approx. 398-402), `docs/reference/architecture.md` (approx. 130-136, the wave-2 correction), `docs/runbooks/backlog-json-patch.md` (the banner precedent), `docs/adr/0002-backlog-integration-json-only.md` (2026-07-17 amendment), `docker/e2e/Dockerfile` (approx. 49-52, ground truth), LCLI-5, LCLI-270 (Done — corrected architecture.md).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README.md no longer asserts in the present tense that lore consumes a fork of Backlog.md as a git dependency; it describes the current upstream-direct model
- [x] #2 tech-stack.md's fork-dependency passage is either corrected or carries an explicit dated superseded banner following backlog-json-patch.md's existing convention
- [x] #3 A repo-wide sweep for further present-tense fork-dependency assertions is performed and every hit is corrected or explicitly recorded as intentionally historical
- [x] #4 Claims about what lore actually consumes are verified against docker/e2e/Dockerfile and package.json rather than reconstructed from other docs
- [x] #5 Full suite + lore check stay green; the diff contains no src/ changes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified current behavior against docker/e2e/Dockerfile's upstream MrLesk checkout at commit 22a091b and package.json's absence of a Backlog dependency. Repo-wide hits in ADRs, schema migration docs, and backlog-json-patch are intentionally historical and explicitly amended/superseded.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated the README and tech-stack front doors to describe the upstream executable contract and corrected adjacent onboarding/index drift while preserving clearly historical fork records.
<!-- SECTION:FINAL_SUMMARY:END -->
