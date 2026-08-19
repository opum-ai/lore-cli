---
id: LCLI-340
title: >-
  Manifest kind registry: init and new declare bare kinds, and agent's other
  emitted kinds are undiscoverable
status: Done
assignee:
  - '@lore-cli'
created_date: '2026-08-17 15:21'
updated_date: '2026-08-19 03:37'
labels:
  - core-concept-manifest
  - output-contract
  - opum-contract
  - 'doc:stories/harden-post-0-2-lore-correctness'
dependencies: []
documentation:
  - docs/stories/harden-post-0-2-lore-correctness.md
priority: medium
type: bug
ordinal: 463000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two gaps in the `lore help --json` capability manifest, both against the Opum command contract's kind-registry requirements (opum-doc `docs/specs/opum-command-contract.md` section 4).

## 1. Two kinds are not in dotted command.payload form

Section 4.1 requires every command supporting --json to declare 'a stable kind string in dotted `command.payload` form (e.g. `query.results`, `check.report`)'. Of the 29 manifest commands on lore 0.3.2, two declare a bare name, and the handlers emit that same bare value:

    $ lore init --yes --json   -> {"schemaVersion":1,"kind":"init",...}
    $ lore new adr "T" --json  -> {"schemaVersion":1,"kind":"new",...}

Every other command conforms. Note that changing a shipped kind value is consumer-visible; the contract's versioning policy treats additive change as safe and renames as needing ratification, so this may need an additive path (emit the dotted kind, keep the bare one accepted by consumers for a deprecation window) rather than a straight rename.

## 2. A multi-action command's other kinds are not discoverable

Section 4.2 requires the registry to be machine-discoverable from live source, so 'an agent must be able to enumerate it without reading source'. `agent` takes three actions (`list`, `show`, `context`) but declares a single kind and no `resultKinds`:

    manifest: agent -> kind "agent.context.export", resultKinds null
    $ lore agent list --json  -> {"schemaVersion":1,"kind":"agent.profiles",...}

`agent.profiles` appears nowhere in the manifest, so an agent enumerating the registry cannot discover it. The mechanism to express this already exists and is already used - `backlog` declares resultKinds ["backlog.adoption.preview","backlog.adoption.apply","backlog.adoption.status","backlog.adoption.rollback"]. `snapshot` is multi-action too but is unaffected: all three of its actions emit `snapshot.result`.

## Why LCLI-213's guard does not catch this

LCLI-213 added a golden cross-check for manifest kind drift, but it compares a hand-transcribed golden table against `buildManifest()`'s static output; it never invokes a handler and reads the emitted envelope. The contract spec calls out this exact limitation in its 'Caveat: what lore-cli's reference test actually exercises'. A manifest entry that declares only one of a command's several emitted kinds is therefore invisible to that guard by construction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every manifest kind is in dotted command.payload form, with a documented additive or ratified path for changing the shipped init and new values
- [x] #2 Every kind a command can emit is discoverable from the manifest, via kind or resultKinds
- [x] #3 agent declares resultKinds covering agent.profiles and the kinds its show and context actions emit
- [x] #4 A test invokes each multi-action command's actions and asserts every emitted kind appears in that command's manifest entry, failing if an action's kind is absent
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit manifest declarations against live handlers. 2. Move init/new kinds to dotted values with documented compatibility. 3. Declare all agent action kinds. 4. Add handler-to-manifest coverage and run focused tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave A: init/new now emit dotted result kinds; agent registry lists all action kinds; live action coverage added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Normalized init/new envelope kinds to dotted values and made every agent action kind discoverable through resultKinds. Verified by manifest/CLI/agent focused coverage, cumulative tests, typecheck, lint, strict Lore gates, and diff hygiene.
<!-- SECTION:FINAL_SUMMARY:END -->
