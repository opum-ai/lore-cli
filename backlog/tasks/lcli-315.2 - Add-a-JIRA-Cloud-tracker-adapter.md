---
id: LCLI-315.2
title: Add a JIRA Cloud tracker adapter
status: To Do
assignee: []
created_date: '2026-08-04 21:49'
labels: []
dependencies:
  - LCLI-315.1
documentation:
  - docs/reference/backlog-cli-contract.md
parent_task_id: LCLI-315
priority: medium
type: feature
ordinal: 436000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement JIRA Cloud as the second tracker backend behind the seam from LCLI-315.1.

Transport and auth. lore runs as a bare subprocess with no MCP session available, so this adapter cannot use `mcp__jira__*` tools — it needs standalone credentials and its own HTTP calls. Use JIRA Cloud REST v3 over Bun's native fetch with Basic auth; no SDK dependency. Read the token from a dedicated environment variable only, never from the config file, following the `LORE_CONFLUENCE_TOKEN` precedent that `src/config.ts` already enforces — that loader actively scans for a committed secret and fails loud (ADR-0013), and the JIRA credentials must sit under the same policy. Do not read another tool's credential file such as `~/.jira-cli`; lore owns its own credential source.

Non-secret settings (base URL, project, board, issue type, default labels, status flow) belong in a `[tracker.jira]` table in `.lore/config.toml`, mirroring the shape the deferred `[confluence]` table already models.

Field mapping is the substance of this task, and the losses must be surfaced rather than resolved silently. Derive the real field set from `BacklogTask` / `BacklogTaskDetail` in `src/adapters/backlog.ts:529,552` and map each field, classifying every one as native, coerced, folded, or lost. Known hard cases:
- No JIRA equivalent: the modified-files list; ordinal ranking has no native field (the Agile Rank API is a later option, not this task).
- JIRA has a single assignee, so any additional assignees are dropped.
- Vocabulary mismatches on type and priority must fail loud rather than guess.
- The narrative fields (acceptance criteria, definition of done, implementation plan and notes, final summary, documentation refs) have no JIRA counterparts and would need folding into a managed region of the description.
- Descriptions are ADF in REST v3, not markdown. The MCP JIRA tools convert server-side; a standalone adapter cannot, so a markdown-to-ADF conversion is required and is the largest hidden cost in this task. Evaluate a library before hand-rolling one.

Behavioral asymmetry to document, not hide: JIRA status writes are constrained by the project's transition graph, so `editTask(id, { status })` can legitimately fail where Backlog.md's unconditional status flag would succeed. Reconcile must surface that as a real error with an actionable diagnostic.

Fail loud on rate limiting and timeouts rather than retrying silently, matching the existing probe's philosophy.

Prior research, non-authoritative: a superseded spec drafted on the mbam5 host in `~/repos/evolv-ultra`. Verify anything taken from it against live JIRA and this repo's source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 createTrackerAdapter returns a working JIRA backend when the tracker backend is set to jira
- [ ] #2 The full adapter interface is implemented, including probe and statusFlow
- [ ] #3 Credentials are read only from environment variables; a token present in .lore/config.toml fails loud like the Confluence token does
- [ ] #4 Every task field is classified as native, coerced, folded, or lost, and the classification is documented in a reference doc
- [ ] #5 A type or priority value outside the JIRA project's vocabulary fails loud instead of being silently coerced
- [ ] #6 Markdown descriptions render to valid ADF, with round-trip tests over the markdown lore actually emits
- [ ] #7 A status write rejected by the JIRA transition graph produces a typed LoreError with an actionable hint
- [ ] #8 Rate-limit and timeout responses fail loud with a typed error and no silent retry
- [ ] #9 Tests run against a mocked HTTP transport and require no live JIRA credentials
<!-- AC:END -->
