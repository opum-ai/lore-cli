---
id: LCLI-339
title: >-
  Declare the reserved principal field on the success, error, and uncaught
  envelopes
status: To Do
assignee: []
created_date: '2026-08-17 15:21'
updated_date: '2026-08-19 00:27'
labels:
  - output-contract
  - opum-contract
  - cli
  - 'doc:stories/harden-post-0-2-lore-correctness'
dependencies: []
documentation:
  - docs/stories/harden-post-0-2-lore-correctness.md
priority: high
type: bug
ordinal: 462000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore emits no `principal` key on any envelope. The Opum command contract makes declaring the slot a MUST for every implementing component, lore-cli included.

Observed on the published lore 0.3.2:

    $ lore validate --json
    {"schemaVersion":1,"kind":"validate.report","data":{...}}
    $ lore help --json
    {"schemaVersion":1,"kind":"help.manifest","data":{...}}
    $ lore tasks no/such/concept --json
    {"error_type":"not_found","message":"concept \"no/such/concept\" is not in the bundle","hint":"...","input":{...}}

The key is absent on every command exercised: validate, check, query, graph, context, tasks, orphans, impact, export, agent, instructions, snapshot, and on every error path exercised (usage, not_found).

opum-doc `docs/specs/opum-command-contract.md` section 2 ('Reserved principal field') is explicit that omission is a non-conformance rather than an unpopulated state:

> A component that cannot yet populate it MUST still declare the slot by emitting `principal: null`; omitting the key entirely is not an equivalent alternative, and is a non-conformance, not a variant. A consumer that sees `principal` absent from an envelope is looking at a non-conforming implementation, not an unpopulated one.

The contract covers all three envelope shapes - SuccessEnvelope, the `{error_type, message, hint?, input?}` error envelope, and UncaughtEnvelope - and fixes the position as the last top-level key (after `data` on success, after `input` on error).

Sibling status: quest-cli already emits `principal: null` on its error envelopes and is fixing its success envelopes under QCLI-99, so lore is currently the only component declaring the slot nowhere.

Populating the field with a real value is explicitly out of scope: the contract's versioning policy requires a ratifying amendment to opum-doc adding PrincipalRef's shape before any component ships a non-null value. This task is null-declaration only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SuccessEnvelope declares principal as its last top-level key, emitted as null
- [ ] #2 The error envelope declares principal as its last top-level key, after input, emitted as null
- [ ] #3 UncaughtEnvelope declares principal as its last top-level key, emitted as null
- [ ] #4 A test asserts the principal key is present on each envelope shape and fails if the key is removed
- [ ] #5 No non-null principal value ships without a prior ratifying amendment to opum-doc's command contract
<!-- AC:END -->
