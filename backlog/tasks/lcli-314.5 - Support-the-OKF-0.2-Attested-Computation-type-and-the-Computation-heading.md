---
id: LCLI-314.5
title: 'Support the OKF 0.2 Attested Computation type and the # Computation heading'
status: To Do
assignee: []
created_date: '2026-08-04 21:47'
updated_date: '2026-08-04 21:47'
labels: []
dependencies:
  - LCLI-314.1
  - LCLI-314.4
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
parent_task_id: LCLI-314
priority: low
type: feature
ordinal: 432000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OKF 0.2 §10 introduces `type: Attested Computation`, a concept that carries executable content rather than only prose, plus a conventional `# Computation` body heading (§4.2).

Its fields: `runtime` (REQUIRED, and it defines how the other parameter fields are interpreted), `parameters` (typed named holes an agent may fill), `computation` (a path to a computation file, or the body fence when omitted), `executor` (run instructions and receipt format), and `attester` (deterministic verification code).

This is the largest and least urgent slice of OKF 0.2, and it is the only one that introduces the idea of a document lore might be asked to run. It is scoped low deliberately and can ship after the rest of the 0.2 migration.

Scope this task to representation only: lore must be able to author, validate, link, and check an Attested Computation concept as a first-class type. lore executing a computation, resolving parameters, or verifying an attestation is explicitly out of scope — if that is ever wanted it is a separate initiative with its own security review, since it means running code found in a documentation bundle.

Note the existing tolerance path already gives partial credit: `src/core/schema.ts` treats an unknown type as conformant with no imposed section shape (`getSections` yields `[]`), so an Attested Computation concept authored by hand does not fail today. This task is about making it a known type with a real schema and a real template, not about unblocking it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Attested Computation is a known concept type with a schema covering runtime, parameters, computation, executor, and attester
- [ ] #2 runtime is enforced as required for this type, and a missing runtime is a validation error (exit 6)
- [ ] #3 lore new scaffolds an Attested Computation with the # Computation heading
- [ ] #4 A computation field pointing at a missing file is reported by lore check
- [ ] #5 lore never executes, evaluates, or resolves parameters of a computation; a test asserts this
- [ ] #6 Under okf_version 0.1 the type remains merely tolerated, not promoted to a known type
<!-- AC:END -->
