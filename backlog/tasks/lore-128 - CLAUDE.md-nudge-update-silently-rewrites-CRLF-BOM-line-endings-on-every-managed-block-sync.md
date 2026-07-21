---
id: LORE-128
title: >-
  CLAUDE.md nudge update silently rewrites CRLF/BOM line endings on every
  managed-block sync
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-meta-c
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`normalizeOnDisk` (src/commands/agents.ts:117-119) strips a leading BOM and converts CRLF/lone-CR to LF, and this normalized string — not the raw on-disk bytes — is what `planNudge` (src/core/agent-bridge.ts:236-247) passes into `upsertManagedBlock` to build the new CLAUDE.md contents. As a result, any real update to the `lore:agents` managed block in a CLAUDE.md that originally used CRLF line endings or had a BOM silently rewrites the entire file to LF-only with the BOM stripped, beyond just the managed block itself. No code path preserves the original line-ending style or BOM when writing the updated file back to disk.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Running `lore agents` (no --check) against a CLAUDE.md with CRLF line endings and/or a leading BOM, where only the managed block needs refreshing, preserves the original CRLF endings and BOM in the rest of the file's bytes on disk.
- [ ] #2 A regression test in test/agents.test.ts (or agent-bridge equivalent) covers a CRLF+BOM CLAUDE.md input and asserts the written output's non-managed-block content retains CRLF/BOM rather than being normalized to LF.
<!-- AC:END -->
