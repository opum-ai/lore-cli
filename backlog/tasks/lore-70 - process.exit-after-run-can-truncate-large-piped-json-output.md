---
id: LORE-70
title: process.exit() after run() can truncate large piped --json output
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
cli.ts calls process.exit(code) immediately after run() resolves. Bun stdout writes to a pipe are asynchronous, so exit() can tear down the process before a large write drains. Reproduced directly: writing 200000 bytes then exit(0) into a pipe truncates to exactly 65536 bytes with exit code 0. Any consumer piping large `--json` output from query/graph/context (CI capturing output, an agent parsing results) can silently receive truncated, invalid JSON with a success exit code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Large --json output (verified above the pipe-buffer size) is never truncated when lore exits, for query, graph, and context
- [ ] #2 A test reproduces a multi-hundred-KB piped output and asserts the full byte count and valid JSON on the other end
<!-- AC:END -->
