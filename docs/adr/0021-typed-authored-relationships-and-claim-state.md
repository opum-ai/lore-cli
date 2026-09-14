---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: Typed authored relationships and claim state
tags:
  - graph
  - okf
summary: Declared requires/alternative/refutes/supersedes relations with precise statement and version references, kept separate from document status and task completion.
timestamp: 2026-09-14T23:14:46.014Z
---

# Typed authored relationships and claim state

## Status

Accepted

## Context

Every authored relationship between two concepts currently arrives in the graph as one of five kinds, and only one of them is expressive: a body markdown link is `link`, and the frontmatter refs `specs`, `supersedes`, `superseded_by` and OKF 0.2 `sources[].resource` carry the rest. A bundle that records an argument — a claim that relies on another claim, a counterexample, a competing approach — has exactly one way to say so, and it is the same way a "see also" aside is said.

A 2026-09-13 read-only inspection of a proof graph held in Lore 0.6.0 and Quest 0.6.0 named the consequence precisely. Reference schemas are loose, so a proof dependency can be *written* as extra frontmatter today; but opaque metadata is invisible to `lore graph`, `lore path` and `lore impact`, which are the three commands anyone would use to ask what a change breaks. The dependency exists in the file and not in the graph.

Three further gaps travel with it:

- A relationship to a whole document is not precise enough for an argument. A proof depends on one numbered statement, at the version it had when it was cited — not on the document that happens to contain it today.
- Whether a claim is established, and how strongly, has nowhere to live. `status` is the OKF knowledge lifecycle and `lore_task_status` is the delivery rollup ([ADR-0019](./0019-separate-okf-lifecycle-from-lore-task-progress.md)); neither says whether the thing the document asserts is believed.
- Nothing can answer "I changed this statement — who cited the old one?", because nothing records which version was cited.

The vocabulary chosen here is close to irreversible once authored documents use it, so this ADR fixes the names, the shapes and the boundaries before the implementation.

## Decision

### Relations are a structured frontmatter family, not more ref fields

Lore reserves a `relations` list on every type. Each entry is a mapping:

```yaml
relations:
  - kind: requires
    target: proof/monotone-bound
    statement: "Lemma 3.2"
    version: "3"
```

`kind` and `target` are required; `statement` and `version` are optional. `target` is a concept reference in the same form `specs`/`supersedes` already accept — a bundle-relative id or a relative path — so one resolution rule covers every frontmatter ref.

A flat ref field per kind (`requires: [ids]`) was rejected. It cannot carry `statement` or `version` without encoding structure inside the string, which is the same "opaque metadata" defect one layer down: a reference whose precision is legible to the author and to nobody else.

### The vocabulary is closed, and one member already existed

`kind` is one of `requires`, `alternative`, `refutes`, `supersedes`, `superseded_by`.

`supersedes` and `superseded_by` are **not** new. They are the existing reserved coupling fields, and a relation entry is a second, more precise spelling of the same fact rather than a rival one: both produce the same edge kind, and `lore supersede` keeps writing the flat field. A concept may use either spelling; a reader that walks edges never has to know which was used.

One rule covers every vocabulary introduced here, `kind` and the claim fields alike: **structural shape is an error; vocabulary membership is a warning.** A `relations` that is not a list, an entry that is not a mapping, or an entry missing `kind` or `target` is a malformed known field and fails validation like any other. An unrecognised *value* is reported by `lore check` and otherwise tolerated.

The asymmetry is about who pays. A validation error fails `loadBundle`, so one unrecognised word would brick every command against the whole bundle. And because these vocabularies are lore-native and will grow, an older lore that *errored* on a value a newer lore writes would make them impossible to extend without a flag day — tolerating the value while naming it is the only reading under which a bundle stays portable across versions.

Tolerated is not silent: an unrecognised `kind` produces **no edge**, so the relation is visibly absent from the graph rather than quietly reinterpreted as something else, and `lore check` attributes it to its file.

### Relations run from the citing concept to the cited one

`from` is the document that authored the relation; `to` is what it points at. An outbound walk from a claim therefore reaches what that claim relies on, which is the orientation task dependency edges already use (dependent → prerequisite, LCLI-476). One mental model covers both.

`alternative` is symmetric in meaning but stored in the direction it was authored, because there is no second document to consult about how it feels. A consumer asking for alternatives walks `--direction either`.

### Proof-bearing is a property of the kind, defined once

A proof-only view selects `requires`, `refutes`, `supersedes` and `superseded_by`, and excludes everything else — `link`, `specs`, `sources`, `task`, `dependency`, and `alternative`.

`alternative` is excluded deliberately, and it is the one a hand-written `--edge` list would get wrong: an alternative is a relationship *between* claims, but it is not support *for* one. Naming the set in one place is the whole value of the flag.

`superseded_by` is included even though it is not one of the four kinds the original finding named. It is the same relation authored from the other endpoint, and a view that honours one spelling but not its mirror reports a different graph depending on which side the author wrote it on. That is a defect, not a policy.

### Claim state is a third axis, beside lifecycle and delivery

[ADR-0019](./0019-separate-okf-lifecycle-from-lore-task-progress.md) established that the knowledge lifecycle and the task rollup are separate facts that must never be derived from one another. What a document *asserts* is a third such fact, and gets its own reserved fields:

- `claim_outcome` — `open`, `supported`, `refuted`, or `withdrawn`.
- `claim_evidence_level` — `none`, `assertion`, `argument`, `empirical`, or `checked`, weakest to strongest.
- `claim_version` — an opaque author-declared marker for "the statement itself changed".

Lore never derives any of the three from `status`, from `lore_task_status`, or from each other, and never writes them itself. A `stable` document may hold an `open` claim; a `done` task says nothing about whether the claim it delivered is `supported`.

`supported` is deliberately not called `proved`, and `checked` is deliberately not called `verified`. Lore validates the syntax of a record and never the truth of one; a vocabulary that says `proved` invites a documentation tool to be quoted as a proof assistant. (`verified` is also already an OKF 0.2 key with an unrelated meaning, so reusing the word as an enum value would collide.)

`claim_version` is author-declared rather than derived from the content hash. A hash changes when a typo is fixed, which would flag every dependent for review and train readers to ignore the signal. An author bumping `claim_version` is asserting that the statement changed, which is exactly the event a citation should be re-examined for.

### Version drift is reported as a question, never as a verdict

A relation's `version` records the `claim_version` its author relied on. Comparing it against the target's current `claim_version` gives one of four states, and each is reported distinctly:

| state | meaning |
|---|---|
| `current` | recorded version equals the target's `claim_version` |
| `stale` | they differ — the dependent **may** need review |
| `unversioned` | the relation recorded no `version` |
| `untracked` | the target declares no `claim_version` |

`unversioned` and `untracked` are named rather than folded into `current`, because a relation that records nothing and a relation that records agreement are different facts and only one of them is evidence. Collapsing them would make the absence of a drift report ambiguous between "nothing drifted" and "nothing was comparable" — a marker that cannot announce its own applicability.

`stale` is a **warning**, worded as possible impact. Lore can see that a cited version moved; it cannot see whether the citing argument still holds. Overstating that would make the signal worth less than saying nothing.

### Schema and rewrite consequences are not optional extras

Relation edges reach the export at projection schema `1.1`, which LCLI-476 introduced in the same unreleased window, carrying their `statement` and `version` qualifiers. Writing is strict at the current version; reading stays tolerant across every superseded one, because retained snapshots cannot be re-exported.

`lore rename` and `lore supersede` rewrite `relations[].target` alongside the flat ref fields. A target-bearing field that the rewrite engine does not know about is a field that silently dangles on the first rename, and the existing `REF_FIELDS` compile-time pin only covers refs whose whole value is the target.

## Consequences

An argument recorded in a bundle is now legible to the same three commands that already answer structural questions, with no new command to learn: `--edge requires` selects support, `--proof-only` selects the proof-bearing set, and `--direction inbound` on a changed statement names its citing dependents.

A bundle that adopts none of this is unchanged. Every new field is optional, every new edge kind is absent when unused, and the projection shape is additive.

The cost is a closed vocabulary that will eventually be too small. `kind` was made an enum rather than a free string on purpose — a free string cannot be filtered on with any confidence, and a proof view that silently includes an unrecognised kind is worse than one that reports it. Widening the enum later is an additive change; narrowing a free string later is not.

Precision is opt-in, which means most relations will carry no `statement` or `version` and most targets will declare no `claim_version`. The drift report says so explicitly rather than reporting those relations as current, so the feature degrades into honest silence rather than false assurance.

This decision extends [ADR-0019](./0019-separate-okf-lifecycle-from-lore-task-progress.md) with a third independent axis and is constrained by [ADR-0011](./0011-frontmatter-serialization-stability.md): the reserved fields trail every authored key in the canonical order, so a document that does not use them is byte-identical to what lore emitted before.
