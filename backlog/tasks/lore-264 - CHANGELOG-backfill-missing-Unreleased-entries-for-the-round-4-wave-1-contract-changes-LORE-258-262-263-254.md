---
id: LORE-264
title: >-
  CHANGELOG: backfill missing [Unreleased] entries for the round-4 wave-1
  contract changes (LORE-258/262/263/254)
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 03:55'
updated_date: '2026-07-25 04:05'
labels:
  - docs
  - release
dependencies: []
priority: low
type: chore
ordinal: 366000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
The `[Unreleased]` section of CHANGELOG.md documents the four user-visible changes merged in round-4 wave 1, at the same level of detail the file already applies to comparable contract changes.

## Why it matters
CHANGELOG.md logs user-visible behavior changes in detail (see the LORE-59/LORE-60 entries for the house style: what changed, why, which file/symbol, and how it was verified). Round-4 wave 1 merged four such changes and none of them got an entry — surfaced by the wave-1 integration review's docs sweep, and confirmed by grep. lore has not cut its first release yet, so `[Unreleased]` is what a first release's notes will be generated from: an empty section means the first release under-reports its own behavior changes.

## What is missing (all merged to dev 2026-07-25)
- **LORE-258** — the `no frontmatter mapping` advisory is now suppressed for reserved stems (`index`/`log`) at loadBundle's choke point, so `link`/`unlink`/`sync`/`tasks` stop warning about lore's own generated hubs. Behavior change visible on stderr.
- **LORE-262** — `supersede --rewrite-links` and `rename` now warn on stderr when a retargeted inbound link's display TEXT still names the old id, instead of silently shipping a text/target mismatch. New `RewritePlan.textMismatches`.
- **LORE-263** — `lore scaffold <target>` is idempotent when the on-disk generated config is byte-identical (exit 0 no-op, `files: []`); exit 5 is now reserved for a user-modified config (naming the file, hinting `--force`) or a non-directory entry blocking a planned directory. A **user-visible exit-code contract change**; `docs/reference/cli-surface.md` and `docker/e2e/run-e2e.sh` were updated for it, CHANGELOG.md was not.
- **LORE-254** — new daily upstream-release watch workflow + script; opens a one-time `upstream-watch` issue when MrLesk/Backlog.md tags a release containing commit 22a091b. Repo tooling rather than CLI behavior — include only if the file's existing convention covers tooling.

## Context
CHANGELOG.md `[Unreleased]`; the merged PRs are #243 (LORE-258), #245 (LORE-262), #244 (LORE-263), #246 (LORE-254), and #247 (the cli-surface.md drift fix for LORE-263). Read the existing LORE-59/LORE-60 entries first and match their voice and depth — terse one-liners would not match this file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of LORE-258, LORE-262 and LORE-263 has an [Unreleased] CHANGELOG entry under the correct Keep a Changelog heading (Fixed/Changed/Added), matching the depth and voice of the existing LORE-59/LORE-60 entries.
- [x] #2 LORE-263's entry explicitly states the exit-code contract change (byte-identical re-run now exits 0 as a no-op; exit 5 reserved for a user-modified config or a directory blocker) — the change most likely to surprise an existing user.
- [x] #3 LORE-254 is either included or deliberately omitted, with the choice consistent with how CHANGELOG.md already treats repo-tooling-only changes; state which was chosen and why in the task notes.
- [x] #4 Every factual claim in the new entries is verified against the merged code on dev, not against this task's summary; lore check, the full suite, typecheck and lint stay green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the real merged diffs for PRs #243 (LORE-258, src/core/bundle.ts), #245 (LORE-262,
   src/core/rewrite.ts + commands/rename.ts + commands/supersede.ts), #244 (LORE-263,
   commands/fswrite.ts + commands/scaffold.ts), #246 (LORE-254, the new workflow + script), and
   #247 (the cli-surface.md drift fix) via `gh pr diff` / `gh pr view` on the already-merged dev
   history. Ground every claim in the actual code, not the task summary.
2. Read the existing LORE-59/LORE-60 entries at the top of CHANGELOG.md's [Unreleased] section to
   match voice/depth (bold title + LORE id, what changed, which file/symbol, why, how verified).
3. Classify headings:
   - LORE-258 -> Fixed (suppresses a spurious advisory; a real defect closed).
   - LORE-262 -> Fixed (a real silent-defect class - text/target mismatch shipping unreported -
     is now caught; retarget behavior itself is unchanged).
   - LORE-263 -> Changed (explicit contract change to an existing command's exit-code/no-op
     behavior; AC#2 requires calling this out plainly).
   - LORE-254 -> Added (new workflow + script).
4. AC#3 decision: CHANGELOG.md's own ### Added section already logs pure repo-tooling additions
   at the bottom (e.g. "CI (LORE-8)", "Dev tooling (LORE-7)") -- so the file's own convention DOES
   cover tooling-only changes. Include LORE-254 under Added, written at the fuller LORE-59/60 depth
   (the terse LORE-7/8 style predates that convention and is not what "matching existing style"
   means per the task).
5. Insert all four entries at the TOP of their respective ### heading (entries run newest-first),
   directly above the existing LORE-60/etc. entries. Cite real file/function names
   (RESERVED_STEMS, classifyExistingFile, LinkTextMismatch, upstream-backlog-watch.ts) and today's
   actual verification run (bun test / typecheck / lint / lore check), not stale PR-description
   numbers.
6. Record the AC#3 decision + rationale in task notes. Update backlog/tasks/ via `backlog task
   edit` only. Touch no other files.
7. Verify: bun test, bun run typecheck, bun run lint, bun run src/cli.ts check all green. Mark
   Done, check ACs, commit (CHANGELOG.md + backlog/tasks/ file), push.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read the real merged diffs (not the task summary) via `gh pr view/diff` for #243 (LORE-258,
src/core/bundle.ts's RESERVED_STEMS suppression), #245 (LORE-262, core/rewrite.ts's new
RewritePlan.textMismatches / renderLinkTextMismatchWarning), #244 (LORE-263,
commands/fswrite.ts's classifyExistingFile + commands/scaffold.ts's per-file idempotent-reuse
logic), #246 (LORE-254, .github/workflows/upstream-backlog-watch.yml +
src/scripts/upstream-backlog-watch.ts), and #247 (the cli-surface.md drift fix, folded into the
LORE-263 entry as a footnote, not its own bullet).

Heading decisions: LORE-262 and LORE-258 -> Fixed (both close a real silent-defect class);
LORE-263 -> Changed (explicit exit-code/no-op contract change to an existing command, called out
plainly per AC#2); LORE-254 -> Added (new workflow + script).

AC#3 decision (repo-tooling inclusion): INCLUDED LORE-254. CHANGELOG.md's own ### Added section
already logs pure repo-tooling additions with no CLI behavior at all -- "CI (LORE-8): GitHub
Actions workflow running lint, typecheck, and bun test..." and "Dev tooling (LORE-7): Biome for
lint + format...". That is direct precedent for logging a new GitHub Actions workflow + script
even though it never touches the `lore` binary's surface. Written at the fuller LORE-59/60 depth
per the task's explicit voice instruction, not the terser original LORE-7/8 style (that terseness
predates the project's current changelog convention and isn't what "match the house style" means
here).

Every specific factual claim (function/file names, exit codes, test counts, the "6 spurious
warning lines" repro) was checked against the merged source on dev and, where possible,
independently re-verified live in this worktree today rather than trusted from PR prose:
- `bun run src/cli.ts sync --dry-run` on the repo's own bundle today: 0 "no frontmatter mapping"
  lines among its 18 stderr lines (all unrelated summary-length lint warnings) -- consistent with
  LORE-258's own recorded before/after repro (6 -> 0), re-confirmed accurate for the fix's current
  effect.
- `actionlint .github/workflows/upstream-backlog-watch.yml` -> exit 0 (ran it myself rather than
  citing the PR's "actionlint-clean" claim secondhand).
- `bun test test/upstream-backlog-watch.test.ts` -> 13 pass / 0 fail, confirming the "13 tests"
  count cited in the LORE-254 entry.
- RESERVED_STEMS, classifyExistingFile, LinkTextMismatch/renderLinkTextMismatchWarning,
  candidateReleases/isAncestorCompareStatus all grep-confirmed present in their cited files at
  their cited names.

Final verification (run today from the worktree root, after all four CHANGELOG entries were
written): bun test -> 2110 pass / 0 fail (48 files, 5956 expect() calls); bun run typecheck ->
clean; bun run lint -> clean (111 files); bun run src/cli.ts check -> 39 files, 0 errors, 0
warnings. These are the exact numbers cited in each new CHANGELOG entry's "Verified against dev"
sentence.

Scope: only CHANGELOG.md and this task's own backlog/tasks/ file were touched (git diff --stat
confirms exactly those two paths).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added four [Unreleased] CHANGELOG.md entries for round-4 wave 1's merged contract changes, at
LORE-59/60 depth (bold title + LORE id, file/symbol names, why, exact behavior, how verified),
grounded in the real merged diffs on dev (PRs #243/#245/#244/#246/#247 read via `gh pr
view`/`gh pr diff`), not the task summary:
- Fixed: LORE-262 (rename/supersede --rewrite-links now warn on a text/target link mismatch via
  the new RewritePlan.textMismatches) and LORE-258 (loadBundle no longer warns about lore's own
  generated index/log hubs, via RESERVED_STEMS).
- Changed: LORE-263 -- states the exit-code contract change explicitly per AC#2 (byte-identical
  bare re-run now exits 0 as a no-op; exit 5 narrowed to a genuine user edit or a directory
  blocker), citing classifyExistingFile/preservedTagsTimestamp and noting the #247 doc-drift
  follow-up.
- Added: LORE-254 (daily upstream-release watch workflow + script) -- included per AC#3, with the
  decision and CI/tooling-precedent rationale recorded in task notes.

Only CHANGELOG.md and this task's own backlog/tasks/ file were touched (git diff --stat
confirms it).

Verified today from the worktree root: bun test -> 2110 pass / 0 fail (48 files, 5956 expect()
calls); bun run typecheck -> clean; bun run lint -> clean (111 files); bun run src/cli.ts check
-> 39 files, 0 errors, 0 warnings. Additional targeted verification: `bun run src/cli.ts sync
--dry-run` today shows 0 "no frontmatter mapping" lines (confirms LORE-258 stayed fixed);
`actionlint .github/workflows/upstream-backlog-watch.yml` -> exit 0; `bun test
test/upstream-backlog-watch.test.ts` -> 13/13 (confirms the LORE-254 entry's test count).
<!-- SECTION:FINAL_SUMMARY:END -->
