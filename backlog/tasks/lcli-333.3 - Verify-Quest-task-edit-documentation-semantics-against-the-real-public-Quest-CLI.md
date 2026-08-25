---
id: LCLI-333.3
title: >-
  Verify Quest task-edit documentation semantics against the real public Quest
  CLI
status: Done
assignee: []
created_date: '2026-08-25 17:52'
updated_date: '2026-08-25 20:57'
labels:
  - quest
  - blocked
  - contract-evidence
  - 'doc:stories/track-lore-cli-tracker-backend-integration'
dependencies:
  - LCLI-333
parent_task_id: LCLI-333
priority: high
type: task
ordinal: 471000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Exact public Quest manifest, command list, and schema-1 envelope evidence is recorded from an installed verified artifact (version pin recheck included)
- [x] #2 Repeated  semantics are proven SET/REPLACE or accumulate against the real binary, with the result recorded and quest.ts/link.ts desiredDocs computation corrected if append-semantics
- [x] #3 Any required version-pin movement off 0.2.7 and manifest descriptor changes are enumerated for LCLI-333.1 and the release gate
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Blocked until Q1 delivers exact Quest manifest/artifact evidence. Awaits: public @opum-ai/quest manifest with schemaVersion 1 descriptors for task edit/view/list/search/create, status-flow, and migration backlog commands; installed executable qualification per LCLI-315.4 procedure.

Verified against installed @opum-ai/quest 0.2.7 (pack /tmp/q1-pack/opum-ai-quest-0.2.7.tgz, sha256 da111b81124168730e027c6ea6acd6158553075cc01e33cf151943d16688facf; integrity sha512-IiK2AZ...N5KLQ==). Manifest registry schemaVersion 1 advertises all contract commands incl task status-flow/list/view/search/create/edit and migration backlog preview/apply/status/rollback with correct mutates flags. Live binary probe of task edit --doc: SET/REPLACE semantics proven — a single --doc replaces the whole documentation array; repeated --doc flags set multiple values in order; edits not touching --doc preserve existing documentation. Write actor argv pinned (--actor <id> --actor-kind human|delegated-agent [--accountable-human <id>]); missing actor => denied envelope. AC#3: no version-pin movement required — 0.2.7 manifest descriptors already match Lore's quest adapter probe contract.
<!-- SECTION:NOTES:END -->
