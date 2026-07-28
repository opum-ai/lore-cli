---
id: LCLI-224
title: >-
  state.ts: `.trim()` on git show-prefix corrupts a whitespace-leading bundle
  prefix
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - cli-entry-state
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 326000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `porcelainPaths` (src/state.ts:317-321), the nested-bundle path translation reads:

```
const prefixResult = await run(spawn, ["rev-parse", "--show-prefix"], "git rev-parse --show-prefix");
const prefix = prefixResult.stdout.trim();
```

`git rev-parse --show-prefix` returns the cwd-relative path from the repo top down to cwd, terminated by a single `\n` (and unquoted — verified against real git). The intent of the `.trim()` is only to drop that trailing newline, but `.trim()` also strips LEADING whitespace, corrupting the prefix whenever the bundle sits under a directory whose name begins with whitespace.

Why it matters: `prefix` is stripped from every `git status`-reported path via `cwdRelative` (src/state.ts:320-321). Verified against real git — for a bundle under a directory named ` proj` (leading space): `git rev-parse --show-prefix` emits the raw bytes ` proj/\n` and `git status --porcelain=v1 -z` reports ` proj/backlog/tasks/x.md`, both with the leading space intact. `.trim()` corrupts the prefix to `proj/`, so `path.startsWith(prefix)` is false, the prefix is never stripped, and the still-prefixed path then fails the `startsWith(BACKLOG_DIR)` defense-in-depth guard at src/state.ts:361-368, throwing a `drift` LoreError that blocks the commit. With the correct prefix ` proj/`, the path would strip cleanly to `backlog/tasks/x.md` and commit normally. A trailing-whitespace directory name is unaffected (the `/` separator sits between the space and the newline), so this is specifically about leading whitespace.

Scope: this is the only `git rev-parse --show-prefix` consumer in src/; the other `.stdout.trim()` (src/adapters/backlog.ts:733) only tests emptiness and needs no change. The fix should preserve behavior for the common empty-prefix (`""`) and normal nested (`"project/"`) cases.

Provenance: Codex second-opinion review (backlog doc-2), low-severity cluster `cli-entry-state`; round-3 re-audit confirmed the defect survives the round-1/2 campaign. Trigger is rare (a directory name beginning with whitespace) but it is a genuine correctness bug consistent with the module's existing investment in pathological-path robustness (NUL-byte and backslash-traversal guards nearby). Existing scripted-`GitSpawn` coverage of the nested-bundle prefix lives in the `commitBacklogIfDirty — nested-bundle cwd` describe block in test/state.test.ts (~line 396), which the regression test can extend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `porcelainPaths` strips only the trailing newline from `git rev-parse --show-prefix`, preserving any leading whitespace in the prefix.
- [x] #2 A scripted-GitSpawn regression test in test/state.test.ts (extending the nested-bundle describe block, ~line 396): with show-prefix scripted as ` proj/\n` and a status entry ` proj/backlog/tasks/x.md`, `commitBacklogIfDirty` strips the prefix to `backlog/tasks/x.md`, passes the BACKLOG_DIR guard, and reaches `git add`/`git commit` with the stripped path (rather than throwing drift).
- [x] #3 Existing prefix behavior is unchanged: an empty prefix (`""`, non-nested) and a normal nested prefix (`"project/"`) still work; the existing nested-bundle tests continue to pass.
- [x] #4 `bun test` passes with the new coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fix porcelainPaths (src/state.ts:319) to strip only the trailing newline from 'git rev-parse --show-prefix' stdout via prefixResult.stdout.replace(/\r?\n$/, ""), preserving any leading whitespace instead of .trim() which strips both ends. 2. Add a regression test in the 'commitBacklogIfDirty — nested-bundle cwd (fake GitSpawn)' describe block (test/state.test.ts) that scripts show-prefix as ' proj/\n' and a status entry ' proj/backlog/tasks/x.md', asserting the stripped path is 'backlog/tasks/x.md' and that add/commit are reached (not a drift throw). 3. Confirm existing empty-prefix and 'project/' nested-prefix tests still pass. 4. Run full bun test + bun run typecheck + bunx biome check on changed files. Do not touch src/adapters/backlog.ts:733.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed: prefix = prefixResult.stdout.replace(/\r?\n$/, "") replaces .trim() at src/state.ts:319-321 (with an explanatory comment) — strips only the single trailing newline git terminates --show-prefix output with, preserving leading whitespace. src/adapters/backlog.ts:733 left untouched (out of scope, only tests emptiness). Added regression test 'regression (LCLI-224): a leading-whitespace prefix is preserved, not corrupted by .trim()' in the 'commitBacklogIfDirty — nested-bundle cwd (fake GitSpawn)' describe block (test/state.test.ts), scripting show-prefix as ' proj/\n' + status entry ' proj/backlog/tasks/x.md'; asserts result.files == ['backlog/tasks/x.md'] and that the scripted spawn.calls[2]/[3] are the add/commit invocations (proving the BACKLOG_DIR guard passed rather than a drift throw).

Verification: bun test test/state.test.ts -> 45 pass / 0 fail (128 expect calls), including the two pre-existing nested-bundle tests (empty-prefix cases covered elsewhere in the file, and 'project/' nested prefix at line 397 + rename case at line 416) still green, proving AC#3. Full bun test -> 1937 pass / 0 fail across 47 files. bun run typecheck -> clean (tsc --noEmit, no output). bunx biome check src/state.ts test/state.test.ts -> 'Checked 2 files in 18ms. No fixes applied.' (no new lint errors). Diff scoped to src/state.ts + test/state.test.ts + this task's own backlog/tasks/ file only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
porcelainPaths (src/state.ts) previously did prefix = prefixResult.stdout.trim() on 'git rev-parse --show-prefix' output, which strips leading as well as trailing whitespace — corrupting the prefix (e.g. ' proj/\n' -> 'proj/') for a bundle nested under a directory whose name begins with whitespace, so the prefix never matched git status's still-space-prefixed paths, tripping the BACKLOG_DIR defense-in-depth guard and throwing a spurious 'drift' LoreError that blocked the commit. Fixed to strip only the trailing newline via .replace(/\r?\n$/, ""), preserving leading whitespace. Added a scripted-GitSpawn regression test in the existing 'commitBacklogIfDirty — nested-bundle cwd' describe block covering a ' proj/\n' prefix + ' proj/backlog/tasks/x.md' status entry, proving the path strips to 'backlog/tasks/x.md' and reaches git add/commit. Verified: bun test (1937 pass/0 fail, 47 files, including the new test and the pre-existing empty-prefix / 'project/' nested-prefix regression tests still green), bun run typecheck clean, bunx biome check on both changed files clean. src/adapters/backlog.ts:733 left untouched per scope. Diff limited to src/state.ts, test/state.test.ts, and this task file.
<!-- SECTION:FINAL_SUMMARY:END -->
