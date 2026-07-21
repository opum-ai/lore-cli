---
id: LORE-90
title: >-
  commitBacklogFiles's backlog/ containment guard uses POSIX-only normalize,
  inconsistent with the project's win32 validation convention
status: To Do
assignee: []
created_date: '2026-07-21 18:52'
labels:
  - backlog-campaign-followup
  - security
  - correctness
dependencies: []
references:
  - backlog/docs/doc-1 - Backlog campaign tracker.md
priority: low
type: bug
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/state.ts:29 imports only `posix` from `node:path`, and `commitBacklogFiles`'s containment guard (state.ts:216-217) normalizes every candidate path via `posix.normalize(file)` before checking `startsWith(BACKLOG_DIR)`, regardless of host OS. Live-verified that a payload such as `"backlog/x\\..\\..\\outside.md"` — a backslash-delimited `..` traversal, the shape a platform-native `path.join` would resolve outside `backlog/` on Windows — passes through `posix.normalize` unchanged (backslash is not a POSIX separator) and satisfies the `backlog/` prefix check without the guard ever throwing.

Live-verified separately against real git what happens downstream: even with a real file planted at the escaped location, `git status --porcelain -z -- ':(literal)backlog/x\..\..\outside.md'` reports zero matching entries — git's own pathspec-literal matcher never treats `\` as a path-component separator. So the concrete effect through this exact function is a silent no-op (`commitBacklogFiles` returns `{committed: false, files: []}`) rather than an actual commit outside `backlog/` — materially lower severity than the sibling LORE-69 NUL-byte bug and LORE-80 `rewriteInbound` backslash bug, both of which actually write/commit past their intended root via a platform-native `path.join`-based fs write. `commitBacklogFiles` never performs an fs write itself; it only shells out to git.

Not reachable today: Backlog.md's own `sanitizeFilename` strips both `/` and `\` from every task-title-derived filename before it can reach this guard, and all current callers source their file lists from Backlog-reported, already-sanitized paths. This repo does ship a Windows CI matrix and a win32-x64/lore.exe release target, and the guard's own doc comment states it exists "to be a hard boundary regardless of what any current caller happens to produce" — a contract this guard does not honor for a backslash-shaped input, even though the practical consequence today is inert. LORE-69's fix established the convention of validating against the actual deployment platform rather than just the host running the code, and LORE-72/LORE-80 already applied that convention to their own equivalent path-containment guards; `commitBacklogFiles` is the one guard in this family that has not been.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A candidate path containing backslash-delimited `..` segments that would resolve outside backlog/ under Windows-native path-join semantics is rejected by commitBacklogFiles's guard, not just a forward-slash-delimited `..` traversal
- [ ] #2 The rejection happens before any git subprocess is invoked (mirroring the existing forward-slash `..` and embedded-NUL guards), so no git call ever receives an out-of-scope literal pathspec for this input shape
- [ ] #3 A regression test exercises a backslash-based traversal payload against commitBacklogFiles and asserts it is rejected with a thrown drift error rather than silently returning an uncommitted no-op
- [ ] #4 The guard's doc comment accurately describes what the backslash case does and does not defend against, including that today's downstream git pathspec matching happens to no-op rather than escape for this specific input
<!-- AC:END -->
