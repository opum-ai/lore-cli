---
id: LORE-224
title: >-
  state.ts: `.trim()` on git show-prefix corrupts a whitespace-leading bundle
  prefix
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 `porcelainPaths` strips only the trailing newline from `git rev-parse --show-prefix`, preserving any leading whitespace in the prefix.
- [ ] #2 A scripted-GitSpawn regression test in test/state.test.ts (extending the nested-bundle describe block, ~line 396): with show-prefix scripted as ` proj/\n` and a status entry ` proj/backlog/tasks/x.md`, `commitBacklogIfDirty` strips the prefix to `backlog/tasks/x.md`, passes the BACKLOG_DIR guard, and reaches `git add`/`git commit` with the stripped path (rather than throwing drift).
- [ ] #3 Existing prefix behavior is unchanged: an empty prefix (`""`, non-nested) and a normal nested prefix (`"project/"`) still work; the existing nested-bundle tests continue to pass.
- [ ] #4 `bun test` passes with the new coverage.
<!-- AC:END -->
