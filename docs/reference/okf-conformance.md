---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: OKF conformance
description: How lore consumes and produces OKF 0.2 and 0.1, separates the OKF conformance floor from stricter Lore gates, and classifies every 0.2 field family.
tags: [okf, conformance, frontmatter, links, producer-profile, validation]
summary: Maps OKF 0.2 and 0.1 conformance to Lore's validation tiers, producer profile, and stricter documentation-coherence gates.
timestamp: 2026-06-21T00:00:00Z
---

# OKF conformance

Lore consumes and produces [Google Open Knowledge Format (OKF)](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)
bundles under `docs/`. The bundle remains `cat`-readable, GitHub-renderable,
and usable by an OKF consumer without Lore installed.

This page distinguishes three contracts that must not be conflated:

1. the permissive OKF conformance floor;
2. Lore's stricter producer-profile validation; and
3. Lore's repository-specific coherence and portability gates.

An exit `6` from a Lore-specific gate does not, by itself, mean the input is
non-conformant OKF.

## Version negotiation

The built-in producer profile targets **OKF 0.2**. A new bundle created by
`lore init` therefore carries `okf_version: "0.2"` on its root `index.md`.
A custom profile may target `0.1` or `0.2`; any other producer target fails
because Lore cannot promise emission semantics it does not implement.

Consumption is negotiated independently:

- a declared `0.1` or `0.2` bundle uses that version's semantics;
- a missing declaration is classified as `legacy-missing` and uses `0.1`
  semantics without rewriting the bundle;
- a present non-string or empty declaration is malformed;
- an unknown future string is retained and consumed best-effort with current
  `0.2` semantics plus a warning, following OKF 0.2 §12.

Reads, validation, checks, and ordinary writes never migrate `0.1` content as
a side effect. This repository's own `docs/index.md` is still explicitly
`0.1`, so the current checked-in bundle continues to use the legacy position
until an explicit migration is requested.

## The two conformance floors

OKF 0.2 defines conformance in **§11**. A bundle is conformant when every
non-reserved Markdown file has parseable YAML frontmatter with a non-empty
`type`, and each reserved `index.md` or `log.md` follows its reserved structure
when present. The other constraints are soft guidance for consumers.

In particular, §11 says a consumer must not reject a bundle because of:

- missing optional frontmatter fields;
- an unknown `type`;
- unknown additional frontmatter keys;
- broken cross-links; or
- missing `index.md` files.

OKF 0.1 expresses the same permissive posture in **§9**. Its floor is also
parseable frontmatter plus a non-empty `type`, with unknown types, extension
keys, and dangling links tolerated. The principal section-number mappings used
by Lore are:

| Concern | OKF 0.1 | OKF 0.2 |
|---|---:|---:|
| Concept frontmatter | §3 | §4 |
| Cross-links and paths | §5 | §6 |
| Index files | §7 | §8 |
| Log files | §8 | §9 |
| Conformance | §9 | §11 |
| Version declaration and negotiation | §4 | §12 |

## Lore's validation tiers

[`lore validate`](./cli-surface.md) is a tiered producer validator. It reports
the OKF floor and Lore's own profile policy in one command, but keeps their
meaning distinct:

| Tier | Finding | Default effect | Contract owner |
|---|---|---|---|
| 1 | Unparseable frontmatter or missing/empty `type` | Error, exit `6` | OKF 0.2 §11 / 0.1 §9 |
| 2 | A known Lore-profile type has malformed fields or lacks required body sections | Error, exit `6` | Lore producer profile |
| 3 | Unknown `type`, extra key on a known type, missing/long `summary`, or a legacy field | Warning; exit `0` unless `--strict` | Lore advisory layered inside OKF tolerance |
| Cross-cutting | Quote-safety or stale computed `resource` | Error or warning by rule | Lore portability/profile policy |

Tier 2 does not narrow what a general OKF consumer must accept. It states what
Lore is willing to emit or certify as one of its known profile types. Unknown
types retain the OKF `type`-only floor, and unknown keys remain preserved.

`--strict` promotes warnings for repository policy. That promotion is a Lore CI
choice, not a retroactive claim that OKF rejects the document.

## OKF 0.2 field-family audit

The runtime validator and editor schemas share the same field definitions.
Every 0.2 family has an explicit classification; none falls through to the
generic unknown-key warning merely because an active custom profile omitted it.

| Field or family | Lore classification when present | Additional `lore check` behavior |
|---|---|---|
| `type` | OKF-floor error when missing, empty, or non-string | Unknown values are advisory, never a default error |
| `title`, `description`, `resource`, `tags` | Optional common fields; profile shape applies when declared | `resource` may receive a Lore resource-drift warning |
| `generated.by`, `generated.at` | Recognized 0.2 family; malformed actor/time is a Lore producer-profile error | None |
| `sources[]`, shared or per-source `usage_window` | Recognized 0.2 provenance family; malformed nested values are Lore producer-profile errors | Missing internal `.md` targets produce warning-tier `broken-source`; URLs and scope descriptions are not graph edges |
| `verified` | Recognized as one event or a list; malformed actors/times are Lore producer-profile errors | None; Lore does not authenticate the actor |
| `status` | Recognized lifecycle value: `draft`, `stable`, or `deprecated` | None; absence means stable under OKF |
| `stale_after` | Recognized absolute date; malformed values are a Lore producer-profile error | Elapsed dates produce warning-tier `stale-after` |
| `runtime`, `parameters`, `computation`, `executor`, `attester` | Recognized for a known `Attested Computation`; `runtime` is required by the Lore profile and malformed contracts are errors | A missing local `computation` asset produces warning-tier `broken-computation`; Lore never opens or executes it |
| `lore_task_status` | Recognized Lore extension for linked-task progress under 0.2 | Status and managed-block drift are Lore coherence errors |
| legacy `timestamp` | Preserved with an advisory under 0.2 | Never converted implicitly |

Unknown nested producer extensions are preserved by the loose object schemas.
Under `0.1`, the new 0.2 families retain their prior extension treatment and do
not acquire 0.2 graph or lifecycle semantics.

## Provenance, trust, lifecycle, and computation behavior

### Generated provenance

Under 0.2, `lore new` and `lore init` emit `generated.by` as
`lore/<package-version>` and `generated.at` as an ISO-8601 string, following the
actor convention in §7. Under 0.1, Lore continues to emit and accept the legacy
`timestamp` field. No ordinary read or write converts between them.

### Sources

Under 0.2, every `sources` entry requires a non-empty `resource` and may carry
`id`, `title`, `author`, `usage_count`, `last_modified`, and a per-entry
`usage_window`. A sibling `usage_window` supplies the shared window. A source
that resolves to a concept becomes a provenance edge; external URLs and
free-form scope descriptions do not. Existing body-level `# Citations` sections
are preserved.

### Trust, lifecycle, and task progress

OKF lifecycle and Lore delivery progress are separate:

| Concern | OKF 0.1 | OKF 0.2 |
|---|---|---|
| Knowledge lifecycle | No closed Lore interpretation | `status`: `draft`, `stable`, or `deprecated`; absent means stable |
| Linked-task progress | `status`: `todo`, `in-progress`, or `done` | `lore_task_status`: `todo`, `in-progress`, or `done` |
| Superseded concept | `status: superseded` plus `superseded_by` | `status: deprecated` plus `superseded_by` |

`verified` accepts one event or a list. Lore validates the actor convention and
time but does not authenticate identity or certify that review occurred.
`stale_after` is advisory freshness state: `lore check` warns on or after that
UTC date without changing lifecycle or task progress. See
[ADR-0019](../adr/0019-separate-okf-lifecycle-from-lore-task-progress.md).

### Attested Computation

OKF 0.2 §10 adds `Attested Computation` and the `# Computation` convention.
Lore validates and represents its contract, can inventory a file-backed
computation path, and may warn when that path is missing. Lore does not execute,
import, bind, evaluate, or attest computation assets. Under 0.1 the type remains
an unknown, tolerated extension rather than a built-in profile type.

## Lore-specific gates beyond §11

[`lore check`](./cli-surface.md) is a repository coherence gate, not a second
OKF conformance validator. It checks links and anchors, Story/task
reconciliation, managed blocks, portability, provenance paths, computation
paths, and staleness.

The most important distinction is broken links. OKF 0.2 §6 and §11 require a
consumer to tolerate them, so Lore loads dangling edges without failing. The
separate `lore check` command nevertheless emits an error-tier `broken-link`
finding because this repository chooses to keep its own authored graph
coherent. That is a **Lore-specific quality gate**, not an OKF conformance
rejection. The same distinction applies to broken anchors, task drift, managed
block drift, and the relative-link portability policy.

Missing `index.md` files do not produce an OKF conformance finding. Lore may
generate indexes for its own producer output during `lore sync`, but an OKF
consumer is not entitled to reject a bundle merely because an optional index is
absent.

Lore emits relative, URL-encoded, `.md`-suffixed links with no leading slash.
OKF 0.2 §6 (0.1 §5) permits relative links while recommending bundle-root
absolute links. Lore's choice keeps links portable across GitHub, Obsidian,
MkDocs, and Docusaurus; its portability warnings remain Lore policy.

## Command interpretation

| Command | Question answered | Meaning of exit `6` |
|---|---|---|
| `lore validate` | Does each file satisfy the OKF floor and, for a known type, Lore's producer profile? | One or more OKF-floor or Lore-profile errors; under `--strict`, an advisory warning may also gate |
| `lore check` | Is the whole bundle coherent under this repository's graph, task, and portability policy? | A Lore-specific coherence error; under `--strict`, an advisory warning may also gate |

Read the finding rule and tier rather than inferring “non-conformant OKF” from
the shared numeric exit code.

## Current repository checklist

- [x] Root [`docs/index.md`](../index.md) explicitly declares `okf_version: "0.1"`.
- [x] Every concept has parseable frontmatter and a non-empty `type`.
- [x] Reserved `index.md` and `log.md` files follow their versioned structure.
- [x] Unknown types and keys are tolerated and preserved.
- [x] Known types pass Lore's stricter producer profile.
- [x] Cross-links use Lore's portable relative form.
- [x] `lore validate --strict` and `lore check --strict` are the repository gates.

## See also

- [CLI surface](./cli-surface.md) — command behavior and output contracts.
- [Portable Markdown](./portable-markdown.md) — Lore's link and lint policy.
- [Consumer compatibility](./consumer-compatibility.md) — renderer behavior.
- [ADR-0003 — OKF as the documentation substrate](../adr/0003-okf-substrate.md)
- [ADR-0006 — Schema, types & templates](../adr/0006-schema-types-templates.md)
- [ADR-0007 — Validation & coherence checking](../adr/0007-validation-and-coherence.md)
- [ADR-0010 — Multi-consumer docs layer & link convention](../adr/0010-multi-consumer-docs-layer.md)
- [ADR-0019 — Separate OKF lifecycle from Lore task progress](../adr/0019-separate-okf-lifecycle-from-lore-task-progress.md)
