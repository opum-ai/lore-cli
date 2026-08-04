---
id: LCLI-90
title: >-
  commitBacklogFiles's backlog/ containment guard uses POSIX-only normalize,
  inconsistent with the project's win32 validation convention
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - backlog-campaign-followup
  - security
  - correctness
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: bug
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/state.ts:29 imports only `posix` from `node:path`, and `commitBacklogFiles`'s containment guard (state.ts:216-217) normalizes every candidate path via `posix.normalize(file)` before checking `startsWith(BACKLOG_DIR)`, regardless of host OS. Live-verified that a payload such as `"backlog/x\\..\\..\\outside.md"` — a backslash-delimited `..` traversal, the shape a platform-native `path.join` would resolve outside `backlog/` on Windows — passes through `posix.normalize` unchanged (backslash is not a POSIX separator) and satisfies the `backlog/` prefix check without the guard ever throwing.

Live-verified separately against real git what happens downstream: even with a real file planted at the escaped location, `git status --porcelain -z -- ':(literal)backlog/x\..\..\outside.md'` reports zero matching entries — git's own pathspec-literal matcher never treats `\` as a path-component separator. So the concrete effect through this exact function is a silent no-op (`commitBacklogFiles` returns `{committed: false, files: []}`) rather than an actual commit outside `backlog/` — materially lower severity than the sibling LCLI-69 NUL-byte bug and LCLI-80 `rewriteInbound` backslash bug, both of which actually write/commit past their intended root via a platform-native `path.join`-based fs write. `commitBacklogFiles` never performs an fs write itself; it only shells out to git.

Not reachable today: Backlog.md's own `sanitizeFilename` strips both `/` and `\` from every task-title-derived filename before it can reach this guard, and all current callers source their file lists from Backlog-reported, already-sanitized paths. This repo does ship a Windows CI matrix and a win32-x64/lore.exe release target, and the guard's own doc comment states it exists "to be a hard boundary regardless of what any current caller happens to produce" — a contract this guard does not honor for a backslash-shaped input, even though the practical consequence today is inert. LCLI-69's fix established the convention of validating against the actual deployment platform rather than just the host running the code, and LCLI-72/LCLI-80 already applied that convention to their own equivalent path-containment guards; `commitBacklogFiles` is the one guard in this family that has not been.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A candidate path containing backslash-delimited `..` segments that would resolve outside backlog/ under Windows-native path-join semantics is rejected by commitBacklogFiles's guard, not just a forward-slash-delimited `..` traversal
- [x] #2 The rejection happens before any git subprocess is invoked (mirroring the existing forward-slash `..` and embedded-NUL guards), so no git call ever receives an out-of-scope literal pathspec for this input shape
- [x] #3 A regression test exercises a backslash-based traversal payload against commitBacklogFiles and asserts it is rejected with a thrown drift error rather than silently returning an uncommitted no-op
- [x] #4 The guard's doc comment accurately describes what the backslash case does and does not defend against, including that today's downstream git pathspec matching happens to no-op rather than escape for this specific input
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Import escapesRoot from ./core/rewrite into state.ts (already exported for exactly this kind of reuse per its own doc comment, precedent: commands/rename.ts's newId check, LCLI-79/80).
2. In commitBacklogFiles's per-path guard (state.ts ~216-217), after confirming normalized.startsWith(BACKLOG_DIR), additionally reject when escapesRoot(normalized.slice(BACKLOG_DIR.length)) is true — this is separator-agnostic (splits on both / and \\) so a backslash-delimited '..' climb is caught even though posix.normalize never touches backslashes. Must slice off the backlog/ prefix first: running escapesRoot on the whole string (prefix included) would let 'backlog' itself absorb one level of '..' climb and miss the real payload.
3. Update the guard's doc comment (state.ts ~188-206) to describe the backslash case: what it defends against (a backslash-delimited traversal that would resolve outside backlog/ under win32 path-join semantics) and the nuance that today's downstream git :(literal) pathspec matching already no-ops for this shape (documented in the task's own root-cause) — this guard is still added because the doc comment's own stated contract is a hard boundary regardless of what any current caller produces.
4. Add a regression test in test/state.test.ts's commitBacklogFiles scope-guard describe block: a backslash-delimited '..' payload (e.g. backlog/x\\..\\..\\outside.md) must throw a drift LoreError with spawn.calls having length 0 (never reaches git) — mirrors the existing NUL-byte and forward-slash '..' regression tests in the same block.
5. Run the full test suite + typecheck; re-verify the exact payload from the task description end-to-end against the fixed guard.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed live against dev HEAD before implementing: state.ts:29 imported only posix from node:path; commitBacklogFiles's guard (state.ts ~216-217) ran posix.normalize(file) then checked startsWith(BACKLOG_DIR) only — backslash is not a POSIX separator so posix.normalize leaves a backslash-delimited '..' payload unchanged and it still passes the prefix check.

Fix: imported escapesRoot from ./core/rewrite (already exported for exactly this reuse, precedent: commands/rename.ts's newId check, LCLI-79/80) and added it to the guard: after the normalized path passes startsWith(BACKLOG_DIR), also reject when escapesRoot(normalized.slice(BACKLOG_DIR.length)) is true. escapesRoot walks segments split on EITHER / or \, so it catches the backslash shape. Critically, it must run on the string with the backlog/ prefix already stripped — running it on the full prefixed string would let the 'backlog' segment itself absorb one level of the '..' climb and miss the real payload (verified this by hand-tracing both forms before writing the fix).

Updated the guard's doc comment (state.ts) to describe the backslash case and the documented nuance that today's downstream git :(literal) pathspec matching already no-ops for this exact shape (git never treats \ as a separator either) — the guard is defense-in-depth against the doc's own stated 'hard boundary regardless of what any current caller produces' contract, not a fix for an active escape.

Verification:
- bun test test/state.test.ts: 43 pass, 0 fail (includes 2 new regression cases: the task's own live-verified payload backlog/x\..\..\outside.md, and a deeper backslash climb backlog/tasks\..\..\..\outside.md — both assert a thrown drift LoreError with spawn.calls.length === 0, i.e. rejected before any git call).
- bun test (full suite): 1659 pass, 0 fail, across 45 files.
- bun run typecheck (tsc --noEmit): clean, no errors.
- bun run lint (biome check .): 0 errors (4 pre-existing infos in an unrelated file, test/supersede.test.ts, untouched by this change).
- Live-CLI verification (not just synthetic tests): built a real scratch git repo under .repro-scratch/, wrote a throwaway script importing the real (fixed) commitBacklogFiles from src/state.ts, and called it with the exact payload backlog/x\..\..\outside.md against that real repo. Confirmed it throws a drift LoreError with the exact message before touching git, and confirmed via git status --porcelain in both the scratch repo and the real lore repo that nothing was staged/committed anywhere. Scratch verification files left in .repro-scratch/ per this campaign's standing convention (not deleted without being asked).

Independent review (general-purpose subagent, post-commit, per this campaign's established ordering discipline): verdict "solid fix, safe to merge" — no blocking findings. Confirmed by hand-tracing and live-CLI re-testing against the real fixed commitBacklogFiles: the backslash-delimited '..' payload is correctly rejected; legitimate paths, a filename merely containing '..' as a substring, and the './'-redundancy case are all correctly NOT rejected (no false positives); slicing off BACKLOG_DIR before calling escapesRoot is necessary and correct (verified by hand-tracing why running it on the full string would miss the payload). Re-ran the full suite independently: 1659/1659 pass, typecheck clean.

Non-blocking follow-up identified (recorded in the tracker's Not-queued section for human triage, not added to this task's scope): commands/rename.ts's newId guard is actually a three-part check (posix.isAbsolute || win32.isAbsolute || escapesRoot), but this fix reused only escapesRoot. Confirmed live that a win32-absolute-looking suffix still passes today (e.g. backlog/C:\Windows\evil.md, backlog/\\server\share\evil.md) — neither is an active escape (same git :(literal) no-op reasoning as the original bug), and both are outside LCLI-90's own stated ACs (specifically scoped to backslash-delimited '..' traversal), so this is not a reason to block the merge. Also noted (pre-existing, not introduced by this diff, not worth a task): the guard's posix.isAbsolute(normalized) disjunct is already dead code given the startsWith(BACKLOG_DIR) check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
commitBacklogFiles's containment guard in src/state.ts now rejects backslash-delimited '..' traversal payloads (e.g. backlog/x\..\..\outside.md), not just forward-slash ones — closing the gap where posix.normalize left such a payload unchanged and it still passed the backlog/-prefix check. Fix reuses core/rewrite.ts's existing escapesRoot (the same separator-agnostic segment-walk already used by rename.ts's newId guard, LCLI-79/80 precedent) applied to the path with the backlog/ prefix stripped. Guard's doc comment updated to describe the backslash case and note today's downstream git :(literal) pathspec matching already no-ops for this shape (defense-in-depth, not an active-escape fix). Verified: bun test test/state.test.ts (43 pass, incl. 2 new regression cases), bun test full suite (1659 pass), bun run typecheck (clean), bun run lint (0 errors), and a live-CLI run of the real fixed commitBacklogFiles against a real scratch git repo confirming the drift throw and that nothing is staged/committed anywhere.
<!-- SECTION:FINAL_SUMMARY:END -->
