---
id: LCLI-169
title: >-
  Harden realGitAdapter.history against quoted non-ASCII paths and sentinel
  collision
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - errors-output-git
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: medium
type: bug
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
realGitAdapter.history() (src/adapters/git.ts:37) spawns `git log --name-only --relative --pretty=format:...` without `-c core.quotePath=false`, so git's default C-style quoting mangles non-ASCII file paths in the `--name-only` output before parseHistory reads them. Separately, parseHistory (line 100) splits the whole stdout blob on the literal SENTINEL string (`\x01lore:log-entry\x01`, line 22) with no verification that a commit subject can never contain that exact byte sequence, so the split is not provably collision-proof even though the code comments assert it is. Both issues can silently corrupt or misattribute file lists in the generated docs/log.md for real-world repos.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A repo history containing a commit that touches a non-ASCII-named file (e.g. `café.md`) round-trips through realGitAdapter.history() with the file path returned unquoted/undecoded correctly, verified by a regression test in test/git-adapter.test.ts.
- [x] #2 The git invocation in realGitAdapter.history() disables path quoting (e.g. via `-c core.quotePath=false`) so non-ASCII paths are never emitted in git's quoted-octal form.
- [x] #3 parseHistory's block-splitting behavior is documented or guarded so a commit subject/body containing the literal SENTINEL byte sequence cannot silently corrupt block boundaries, with a test asserting the guard.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `-c core.quotePath=false` to the `git log` invocation args in realGitAdapter.history() so non-ASCII --name-only paths come back as raw UTF-8 instead of git's default C-style quoted-octal form (AC2). 2. Add a regression test committing a café.md file and asserting commits[0].files round-trips unquoted (AC1). 3. Harden parseHistory's SENTINEL-delimited split against a commit subject/body/file-path literally containing the SENTINEL byte sequence: since detecting this from parseHistory's own output alone is unreliable, add a countCommits() helper that independently cross-checks the parsed commit count against `git rev-list --count` for the identical range+pathspec (which never depends on SENTINEL-delimited parsing), and have history() throw a drift LoreError on mismatch instead of silently returning corrupted commits (AC3). 4. Update the module/SENTINEL/parseHistory doc comments to stop asserting the sentinel 'can never collide' and instead document the guard. 5. Add a regression test crafting a commit whose subject IS the literal SENTINEL bytes and asserting history() throws a drift LoreError mentioning git rev-list --count. 6. Fix the pre-existing LCLI-143 spy test whose Bun.spawnSync filter assumed cmd[1] === "log" (now cmd[1] is "-c" due to the prefixed global option) to match via cmd.includes("log") instead. 7. Full bun test + bun run typecheck + biome check, plus a mutation-check reverting only src/adapters/git.ts to confirm both new tests fail pre-fix and pass post-fix.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: -c core.quotePath=false added to the git log invocation (AC2), non-ASCII path round-trip regression test added and passing (AC1), countCommits()/git rev-list --count cross-check guard added with a drift LoreError on mismatch plus a SENTINEL-collision regression test (AC3). Verification: bun test => 1861 pass/0 fail (47 files, incl. 14/14 in test/git-adapter.test.ts); bun run typecheck => clean; bunx biome check src/adapters/git.ts test/git-adapter.test.ts => clean. Mutation-check performed via git apply -R/apply on a saved src/adapters/git.ts-only patch (tests kept in place): both new tests failed against pre-fix code (café.md path returned quoted-octal; SENTINEL-collision test returned corrupted commits instead of throwing) and passed after re-applying the fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hardened realGitAdapter.history() in src/adapters/git.ts: (1) the git log invocation now passes -c core.quotePath=false so non-ASCII --name-only paths round-trip as raw UTF-8 instead of git's default C-style quoted-octal form; (2) added a countCommits() helper (git rev-list --count on the identical range+pathspec) that history() cross-checks parseHistory's output against, throwing a drift LoreError on any mismatch instead of silently emitting corrupted commits when a subject/body/file-path collides with the internal SENTINEL delimiter. Two new regression tests added to test/git-adapter.test.ts; mutation-checked (both fail against pre-fix src/adapters/git.ts, both pass post-fix). Full suite: bun test 1861 pass/0 fail (47 files); bun run typecheck clean; biome check clean on touched files.
<!-- SECTION:FINAL_SUMMARY:END -->
