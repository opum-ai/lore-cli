---
id: LORE-175
title: >-
  readConfigText denied error omits errno code field, diverging from the shared
  denied contract
status: To Do
assignee: []
created_date: '2026-07-22 13:19'
labels:
  - codex-review-followup
  - cli-entry-state
dependencies: []
priority: low
type: bug
ordinal: 121500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-2 integration-review follow-up of LORE-108. LORE-108 correctly made readConfigText (src/config.ts) throw a `denied`-typed LoreError on EACCES/EPERM, but its structured `input` carries only { path: CONFIG_REL_PATH } and omits the errno `code` field. The codebase-wide denied contract it cites — errors.ts readFileIfPresent (~line 281) and ioError (~line 330) — always attaches `code` to the --json error envelope's `input`. So a machine consumer reading `envelope.input.code` on a denied error gets it from every other site but not from config reads. Separately, loadConfig's docstring (src/config.ts:~105-110) still promises only `validation` errors and is now stale. Low severity: LORE-108's ACs (type=denied, exit code) are already met; this is contract-consistency polish, not a functional bug. Found by the wave-2 integration review (2026-07-22); see doc-3 wave log.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 readConfigText's denied LoreError includes the errno `code` (e.g. 'EACCES'/'EPERM') in its structured `input`, matching the shape emitted by errors.ts's ioError/readFileIfPresent for denied errors
- [ ] #2 loadConfig's docstring is updated to reflect that a denied error type is now possible (no longer only 'validation')
- [ ] #3 A test asserts the denied error's input.code is populated for an EACCES/EPERM config read; existing LORE-108 denied-type/exit-code assertions still pass
<!-- AC:END -->
