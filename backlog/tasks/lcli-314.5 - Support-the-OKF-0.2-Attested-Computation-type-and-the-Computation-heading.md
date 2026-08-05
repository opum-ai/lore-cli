---
id: LCLI-314.5
title: 'Support the OKF 0.2 Attested Computation type and the # Computation heading'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 21:47'
updated_date: '2026-08-05 16:08'
labels: []
dependencies:
  - LCLI-314.1
  - LCLI-314.4
references:
  - >-
    https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
modified_files:
  - src/core/profile.ts
  - src/core/schema.ts
  - src/core/template.ts
  - src/core/check.ts
  - src/core/scaffold.ts
  - src/commands/check.ts
  - .lore/schemas/attested-computation.schema.json
  - test/check.test.ts
  - test/cli.test.ts
  - test/fixtures/README.md
  - test/fixtures/okf-bundle/attested-computation/revenue.md
  - test/init.test.ts
  - test/new.test.ts
  - test/profile.test.ts
  - test/scaffold.test.ts
  - test/schema-export.test.ts
  - test/schema.test.ts
  - test/template.test.ts
  - test/validate.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add Attested Computation to the built-in OKF 0.2 profile while compiling the legacy built-in OKF 0.1 profile without it; preserve custom profile ownership and 0.1 unknown-type tolerance.
2. Add one shared runtime/editor contract for runtime, parameters, computation, executor, and attester; require non-empty runtime for this known 0.2 type and expose the same nested shapes in its emitted Draft-7 schema.
3. Scaffold the built-in type with an explicit placeholder runtime and a # Computation body template so no-flag lore new remains valid by construction.
4. Extend the pure check contract with a warning-tier missing-computation finding backed by the command layer’s symlink-safe inventory of regular bundle files; inspect paths only and never read, execute, evaluate, attest, or bind computation content or parameters.
5. Add focused core and command coverage for valid/malformed fields, exit 6 on missing runtime, scaffolding/modeline/path behavior, missing and existing computation resources, non-execution, and unchanged OKF 0.1 tolerance.
6. Regenerate the editor schema and run focused suites, lint, typecheck, the full test suite, strict Lore validation/checking, diff checks, and an adversarial self-review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation and acceptance verification 2026-08-05:
- OKF 0.2 now exposes Attested Computation as a built-in known type with one shared runtime/editor schema for required runtime plus parameters, computation, executor, and attester. The generated Draft-7 schema requires type and runtime.
- lore new writes a valid representation-only scaffold at docs/attested-computation/, includes runtime: TODO, an editor modeline, and the conventional # Computation text fence.
- lore check reports warning-tier broken-computation findings for missing internal computation files. The command inventories regular paths through the symlink-safe walker and never opens non-Markdown computation assets.
- The non-execution command test points computation at a shell script that would write a marker if run; lore check returns clean for the present asset and the marker remains absent. No parameter binding, evaluation, attestation, import, or process-spawn path was added.
- The built-in OKF 0.1 consumer profile retains exactly the legacy six types; hand-authored Attested Computation remains an unknown, type-only-tolerated extension. Custom profiles retain their explicitly-owned vocabulary.

Verification: focused suite 724 pass, 0 fail across 10 files; npm run lint passed across 191 files; npm run typecheck passed; full bun test --dots passed 2522, skipped 1 environment-specific test, failed 0, with 8558 expectations across 76 files; lore validate --strict --json reported 0 errors and 0 warnings; lore check --strict --json reported 0 findings across 65 files; git diff --check passed. lore sync --dry-run reports only docs/log.md would update.

Adversarial self-review exercised the 0.2/0.1 profile boundary, custom-profile ownership, relative and bundle-root path normalization, external target exclusion, symlink-skipped assets, and the absence of file reads or execution for non-Markdown computation assets. No unresolved defect was found.

Delivery blocker: wave 6 has no local commit or managed Lore synchronization authority. The task remains In Progress with acceptance boxes intentionally unchecked until the required delivery state exists. The verified implementation is retained uncommitted. Unrelated LCLI-317/LCLI-318/LCLI-319 remain byte-identical at SHA-1 bb9a81094c25ddcd22bea674771e8d62c84e44af, 892978f2f5e14b5054f06002efd2c8f173557360, and ff895880f41b47067750901fd17d301a1543b682.
<!-- SECTION:NOTES:END -->
