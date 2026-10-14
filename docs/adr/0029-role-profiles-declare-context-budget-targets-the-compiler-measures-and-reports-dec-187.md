---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: Role profiles declare context-budget targets the compiler measures and reports, and lore checks ODOC-437 AC3's ceilings (DEC-187)
tags:
  - agent-context
  - budgets
  - mdl-7
  - lcli-682
  - dec-187
summary: "DEC-187 A: the four role profiles declare per-class context-budget targets the compiler measures a pack against, reports additively, and checks AC3's ceilings against."
timestamp: 2026-10-14T02:33:06.000Z
status: stable
---

# ADR-0029: Role profiles declare context-budget targets the compiler measures and reports, and lore checks ODOC-437 AC3's ceilings (DEC-187)

## Status

**Accepted — 2026-10-14 (DEC-187 A).** Recorded by `opum-doc` in `opum-ai/opum-doc#997`. Relayed
here by the `opum-agent` leader, and the budget figures it depends on were read from the record
itself — `opum-doc` `docs/standards/model-routing-and-cost.md` **MDL-7** and
`docs/specs/opum-task-context-and-evidence-contract.md#instruction-and-context-budgets` — by ref,
not taken from the relay.

## Context

ODOC-437 slice 3 (LCLI-682). The four role profiles under `.lore/agents/` declared only
`max_tokens`, a ceiling on a compiled pack. MDL-7 and the task-context contract instead describe a
worker's startup prompt as **classes with design-default targets** — at most 3k always-loaded policy
and role, at most 2k task contract, 3–6k task Lore evidence, about 1k code map, and a 10–15k total
including harness and tools — and require the `chars/4` figure be labelled an estimate with
provider-reported usage recorded separately. ODOC-437 AC3 adds hard **acceptance ceilings**: at most
8k authored bootstrap and 16k task evidence.

Two things were unsettled when the slice was dispatched and were ruled at dispatch: which of the two
tables governs (both, each to a different job — the table is the TARGETS, AC3 is the CEILING), and
how the classes map onto what lore actually emits. `lore-cli` owns retrieval; `opum-cli` composes the
Quest task, the Lore anchors and the code pointers, so lore emits only part of a worker's startup.

## Decision

**The four role profiles declare `[targets]`; the compiler measures a compiled pack against them and
reports it, additively, on `agent.context.export` and in the pack's rendered `## Context budgets`
section.**

- **What is measured is the COMPILED pack**, not a profile's declared set: the acceptance criterion
  names the compiler, and the profile's declared set is already measured separately by
  `agent-profile-capacity`.
- **The mapping.** Policy-and-role is the pinned tier; task evidence is the ranked sections; task
  contract is the `--task-contract` block; `lore_subtotal` is the pack lore composes. The initial
  code map and the harness/tools floor are composed by `opum-cli`, so lore reports them
  **not-applicable** — `measured: null` with the reason `composed by opum-cli`, never a `0` and never
  an absent key, either of which a consumer could read as a measurement.
- **AC3's ceilings are checked** against lore's own measurement: authored bootstrap is policy and
  role **plus** task contract (the code map is generated and the harness floor is not authored, so
  neither counts), and task evidence is the ranked tier alone.
- **Provenance rides with every figure.** Each lore figure carries `measuredBy: "chars/4 estimate"`
  (MDL-10); the provider-usage slot records its `source` — `provider-reported` when `opum-cli`'s
  model gateway fills it (MDL-15), `manual` when a caller passes `--provider-input-tokens`. A manual
  figure is never treated as provider-reported, and the AC3 ceilings are checked against lore's own
  estimate rather than it.
- **Additive only.** A profile that declares no target is not reported at all, so its pack stays
  byte-identical; the new export fields bump no `schemaVersion` (cli-contract §1).
- The declared-set capacity measurement renders through the same `assemble`, so it is told to
  **exclude** this report — otherwise the report would inflate the very size it measures.

## Consequences

- A worker's startup budget is observable where it is spent: `opum-cli` assembles the 10–15k total
  from this export, its own code map and the harness floor, and can attribute an overrun to the
  class and the content that required it.
- The report is a target report, not a gate. It never fails a compile; `max_tokens` remains the only
  ceiling the pack itself must satisfy, and the `agent-profile-capacity` finding remains the
  declaration-side gate.
- The `chars/4` estimator stays an estimate. Real provider reconciliation is `opum-cli`'s, through
  the provider-usage slot this decision adds a home for.
- lore's half of the mapping is now recorded; the class-to-part mapping as it applies to the whole
  startup prompt remains `opum-cli`'s to compose against.
- **A recorded residual in the measurement, following
  [ADR-0025](./0025-the-capacity-measurement-reserves-the-worst-case-bundle-wide-query-section-and-renders-score-annotations-at-full-width-dec-98.md)'s
  precedent.** The declared-set capacity measurement (`measureAgentProfileCapacity`) renders through
  the same `assemble` with `reportBudgets: false`, while the first-fit fill and the pinned-ceiling
  check pass `true`. The measurement therefore sizes the profile's EVIDENCE and deliberately excludes
  this report — a report that measured itself would inflate the very size it measures. The residual is
  that a pack's rendered `## Context budgets` bytes are outside the capacity figure; that exclusion is
  the intent, and it is recorded rather than left to be rediscovered (LCLI-682 review finding 2).
- **`provider-reported` is unreachable from lore.** The provider-usage slot's `provider-reported`
  value is reserved for `opum-cli`'s model gateway (MDL-15), and no lore seam produces it today — only
  `manual`, from `--provider-input-tokens`. A consumer must therefore not read the absence of a
  `provider-reported` figure as "there was no provider input" (LCLI-682 review finding 3).
