---
type: Spec
title: Agent profile context retrieval
tags:
  - agents
  - context
  - retrieval
  - cli
  - orchestration
summary: Defines the local profile schema, CLI surface, deterministic section retrieval, evidence pack, and orchestrator roster contracts.
timestamp: 2026-08-01T17:28:19.882Z
---

# Agent profile context retrieval

## Summary

Lore provides named, committed context profiles that constrain its existing
deterministic retrieval to the evidence relevant to a specialist or
orchestrator. Profiles are portable context policy only. Native Claude Code and
Codex agents continue to own behavior, tools, models, permissions, skills,
memory, sandboxing, and execution.

The public surface is a singular `lore agent` command family. It compiles one
bounded, source-attributed evidence pack from explicit profile references,
using mandatory pins followed by task-ranked Markdown sections. The existing
plural `lore agents` bridge command retains its current meaning.

## Requirements

- Git-tracked documentation and `.lore/` configuration remain source truth.
  The LadybugDB projection remains derived and the in-memory bundle remains the
  conformance oracle.
- A profile never silently broadens beyond its explicit concept or heading
  references. Graph-neighbor expansion is not implicit.
- Pinned evidence is mandatory and cannot disappear behind relevance ranking.
- Successful context output fits its effective budget and reports complete
  selection and omission accounting.
- Retrieval remains deterministic, lexical, local, and read-only with no
  embeddings, inferred relationships, model calls, network requests, or raw
  Cypher.
- Profiles do not enter the OKF concept graph or projection schema `1.0`.
- Missing profile configuration is backward compatible for every existing
  command.
- Repository documentation is evidence, not a mechanism for overriding system,
  developer, native-agent, sandbox, or permission instructions.
- A profile is a retrieval scope, not an authorization boundary. Filesystem and
  host permissions remain authoritative.

## Design

### Profile storage and schema

Lore discovers regular `.toml` files directly below `.lore/agents/`, in
code-unit filename order. A missing directory means no profiles. Symlinks,
directories masquerading as profile files, case-colliding names, and unknown
keys fail validation.

Specialist example:

```toml
schema_version = 1
name = "frontend-dev"
description = "Frontend implementation and UI review context."
kind = "specialist"
max_tokens = 8000

pinned = [
  "reference/ui-style#accessibility"
]

sources = [
  "specs/ui-design",
  "adr/0012-client-state"
]
```

Orchestrator addition:

```toml
kind = "orchestrator"
delegates = ["frontend-dev", "backend-dev", "qa-reviewer"]
```

Contract:

- `schema_version` is required and equals integer `1`.
- `name` is required lower-kebab, matches the filename stem, and is unique.
- `description` is required, single-line routing metadata of at most 300
  characters. It is not injected behavioral guidance.
- `kind` is required and is `specialist` or `orchestrator`.
- `max_tokens` is an optional positive safe integer and defaults to `8000`. It is
  a ceiling on the pack, and it is also a promise about the declaration: the
  profile's **complete declared set** — every candidate of every `pinned` and
  `sources` reference, plus the auto-pinned Constitution — must fit inside it.
  A profile whose declared set cannot fit is reported by `lore check`
  as `agent-profile-capacity`, naming the profile, its budget, and the sources
  that cannot fit (LCLI-642). That measurement is the size of the set **as a real
  pack renders it** — the per-item and catalog score annotations at full score
  width, and the worst-case bundle-wide query section reserved rather than
  rendered — so it stands for the largest pack a task can compile, up to the one
  residual [ADR-0025](../adr/0025-the-capacity-measurement-reserves-the-worst-case-bundle-wide-query-section-and-renders-score-annotations-at-full-width-dec-98.md)
  records and measures: the pack header renders the task text verbatim, so a task
  much longer than the measurement's fixed stand-in can still consume the margin.
  Within that bound, a
  budget that satisfies it cannot start dropping declared evidence on a task, and
  a budget that only appears to satisfy it cannot hide behind that appearance (LCLI-662, DEC-98 B). DEC-11 rules that this ships as a **warning for one
  release and then as an error**; the flip is held by LCLI-646. The finding is
  computed from the declaration and the bundle, never from a task, so it is the
  same on every task and never
  depends on what a particular pack happens to retain — task-ranked omission is
  normal retention and is not this finding.
- `pinned` and `sources` are optional ordered arrays defaulting to empty. Each
  item is a canonical bundle-relative concept id with an optional
  GitHub-compatible `#heading-anchor`.
- References resolve against the active verified bundle. Anchors use the same
  duplicate-heading slug behavior as `lore check`.
- References are unique after normalization. A whole-document reference
  overlaps every section reference to the same concept and cannot appear in
  both tiers.
- A specialist declares at least one pinned or ranked reference and cannot
  declare `delegates`.
- An orchestrator declares at least one direct delegate and may declare its own
  evidence. Delegates may be specialists or orchestrators, but the complete
  directed graph has no missing node, self-edge, or cycle.

All profile files load and validate as one snapshot. `lore check` validates the
same syntax, references, and delegate graph before emitting a coherence report.
A profile command fails before output when its snapshot is invalid.

### CLI surface

| Command | Contract |
|---|---|
| `lore agent list` | List name, kind, description, effective default budget, source count, and direct-delegate count in deterministic name order. |
| `lore agent show <name>` | Show the resolved profile and normalized references without document bodies. |
| `lore agent context <name> --task "<text>"` | Compile the task-scoped context pack. |

`context` accepts:

- exactly one of `--task <text>` or
  `--task-file <repo-relative-path|->`; task files cannot escape the repository
  or traverse a symlink;
- `--max-tokens <n>` to override the profile default;
- `--task-contract <repo-relative-path|->` (LCLI-681) to compile the lean
  task-startup pack from a `TaskContract`;
- `--out <repo-relative-path>` to atomically write the same canonical Markdown
  bytes emitted by the plain renderer; and
- `--force` only with `--out`, to replace a differing regular file.

Global `--plain` and `--json` retain their current precedence and stream
contract. Pretty and plain render the same pasteable Markdown evidence pack.
JSON uses Lore's standard envelope with these kinds:

- `agent.profiles`;
- `agent.profile`; and
- `agent.context.export`.

An unknown profile is `not_found` exit `3` for `show`. For `context` it is not
a failure (LCLI-575, opum-doc ADR "Make lore agent context always
query-augmented", ODOC-265): the pack degrades to the bundle-wide query hits
alone, carries `profileMissing: true` and a `> Warning:` line naming the absent
`.lore/agents/<name>.toml`, writes the same warning to stderr, and exits `0`.
That exit-code remap bumps the `agent.context.export` envelope to
`schemaVersion` `2` (the ADR's Amendment 1, opum-doc `main` a8bb596). LCLI-680
raises it to `3`: the pack footer's `total`/`shown`/`truncated` now count the
eligible deck (the candidates left after the zero-score exclusion of selection
step 4), a meaning change to existing fields; the same change bumps
`agent.workflow.projection` to `2` too, since it embeds a pack from the same
selection code. All are per-`kind` bumps
([CLI contract](../reference/cli-contract.md) §5.6, §7.1). Contract mode
(`--contract`) is unchanged and still fails closed: no binding at all (empty
or absent stdin) yields `OPUM_WORKFLOW_LORE_BINDING_ABSENT`, while a
binding that names a missing profile yields `OPUM_WORKFLOW_LORE_ABSENT`
(LCLI-679). Invalid arguments are usage exit
`2`; output permission failures are `4`; a differing output collision is `5`;
and malformed profiles, references, cycles, or impossible pinned budgets are
validation exit `6`. The command decides validation, retrieval, and write
outcomes before stdout.

`--out` resolves against the repository root and may not escape it. The writer
applies the existing whole-target symlink sweep, creates parent directories
safely, and uses the existing atomic temp-write plus rename boundary. Identical
bytes are unchanged. `.lore/cache/contexts/` is the recommended ignored
location, but no context file is written by default.

### Context export

The structured `AgentContextExport` contains:

- `profile`: name, description, kind, and effective default;
- exact `task`, effective `maxTokens`, final `tokenEstimate`, and `packDigest`;
- `pinned`: every mandatory selected item, the auto-pinned Constitution first
  when there is one (step 3);
- `sections`: ranked selected items in emission order;
- `catalog`: every allowed source with resolved id/path/title, candidate and
  selected counts, top score, token estimates, and included/omitted reason —
  `constitution` for the auto-pin (LCLI-609), `pinned` for a profile's own pin,
  and for a source selection did not take, `omitted-by-relevance` when the
  zero-score exclusion emptied it whole (LCLI-680) or `omitted-by-budget` when
  the budget dropped it;
- `queryHits`: up to three bundle-wide `lore query` hits for the task whose
  concept is not already pinned or selected in the pack, best first, each as
  `id`, optional `title` and `snippet`, `score`, and workspace `provenance`
  when compiled with `--workspace` (LCLI-575; always present on a plain
  `lore agent context` pack, possibly empty; absent from the pack the workflow
  projection embeds — see step 8);
- `queryHitsOmitted`: how many of those hits the token budget cut, so an empty
  or short `queryHits` is never ambiguous between an empty corpus (`0`) and the
  budget (`> 0`); always present alongside `queryHits`;
- optional `queryHitsSectionOmitted: true` when the budget left no room for
  even the section's heading and omission line, so the pack has no section;
- optional `profileMissing: true` when the named profile did not exist;
- optional `delegates`: direct name, kind, and description entries;
- `total`, `shown`, and `truncated` computed over the eligible deck — the ranked
  candidates remaining after the zero-score exclusion (LCLI-680; see
  "Deterministic compilation" below); and
- optional `write`: repo-relative path plus `created`, `updated`, or
  `unchanged`.

Each selected item carries its normalized reference, concept id, optional
anchor and heading breadcrumb, repo-relative source path, exact body bytes,
chars-per-four token estimate, SHA-256 content digest, and optional BM25 score.
The pack digest is SHA-256 over the final canonical Markdown bytes. No
timestamp, Git cleanliness, absolute path, Ladybug identifier, or database
detail enters the pack.

### Deterministic compilation

1. Resolve the profile and all referenced concepts from the same verified
   retrieval snapshot used by `graph`, `query`, and `context`.
2. Render and reserve fixed overhead: task/profile header, evidence warning,
   complete compact source catalog, budget/truncation footer, and an
   orchestrator's direct-delegate roster.
3. Resolve pins in authored order. A whole-document pin includes the full body;
   an anchored pin includes that complete heading-bounded section. Pins are
   never truncated. If fixed overhead plus pins exceeds the effective budget,
   validation fails with a remedy to raise the budget, narrow a pin, split the
   source, or move it to ranked context.
   Before those pins comes the bundle's built-in Constitution (LCLI-609, from
   opum-doc's ADR "Add Constitution and Constants document types to lore", R8
   as clarified by Amendment 4). It is found by the same discovery `lore agents`
   uses and is pinned whole, with catalog reason `constitution`. It is counted
   in the same mandatory budget, so an oversized one fails the same way, and
   the remedy then names it. There is no auto-pin in three cases: the bundle
   has no built-in Constitution (a profile-declared `Constitution` type is not
   one, per the ADR's R12); the profile references the Constitution's concept
   itself in `pinned` or `sources`, whole or by heading (the overlap rule
   below, applied to the auto-pin); or the pack is a `--workspace` one. The
   workflow projection pack is auto-pinned too, and its catalog entry puts the
   file in `inputRevisions`. With no auto-pin the pack's selection reduces to the
   pre-LCLI-609 one, but it is no longer byte-identical to it: the same selection
   code counts its `total`/`shown`/`truncated` over LCLI-680's eligible deck
   (step 8; cli-contract §5.6).
4. Build candidates from `sources`. A source explicitly narrowed to a heading
   produces candidates only within that section. Lore never follows an
   unlisted graph neighbor.
5. Keep a source whole when its emitted estimate is no greater than
   `min(2000, floor(maxTokens / 4))`. Otherwise parse its body with the existing
   Markdown AST and partition it into non-overlapping heading-bounded sections.
   Carry ancestor headings as a breadcrumb. Split an oversized section only at
   top-level AST block boundaries; never cut a code block, list, or table. One
   indivisible oversized block remains one candidate and may be omitted.
6. Reuse the exact arbitrary-record BM25 scorer behind `lore query`. Rank only
   this profile's candidates using concept id, title, summary, tags, heading
   breadcrumb, and body as searchable text.
7. Sort score descending, then declared source order, document section order,
   and normalized reference. If tokenization yields no task term or every
   candidate scores zero, fall back to declaration and section order.
8. Reserve the bundle-wide query section (LCLI-575) — for the plain
   `lore agent context` pack only. The pack the opum-agent-workflow/v1
   projection embeds (`agent project`, `agent context --contract`) skips this
   step entirely and carries no query-hit field (the ADR's Amendment 1, opum-doc
   `main` a8bb596): its `inputRevisions` lists only the catalog's sources, so a
   whole-bundle hit would let an unlisted document change a pinned
   `packDigest`. That pack stays hit-free, but the same selection code applies
   LCLI-680's eligible-deck change inside it, so it is no longer byte-identical
   to the pre-LCLI-575 one (hence the envelope's `schemaVersion` `2`,
   cli-contract §5.6). For the plain pack, run the task through the
   exact `lore query` ranking over the whole bundle, not just the profile, and
   keep hits whose concept is not already pinned or selected, up to three. The
   section is body-free (id, title, snippet), so the profile allowlist still
   governs every byte of quoted evidence. It is reserved before ranked
   evidence, and shrinks below three only when the pins leave no room. The
   mandatory-pin budget failure in step 3 is judged without it — not even its
   heading — so the floor's selection reduces to the pre-LCLI-575 loop and the
   section never turns a pack that compiles into one that fails. The floor is no
   longer byte-for-byte the pre-LCLI-575 one, though: the same selection code
   counts its `total`/`shown`/`truncated` over LCLI-680's eligible deck
   (cli-contract §5.6). When the budget cuts
   hits, the section says so (`showing N of M`, or an `_Omitted by budget_`
   line when it cuts all of them); when not even that line fits, the section is
   dropped and `queryHitsSectionOmitted` plus a stderr warning carry it. With
   `--workspace --repository`, the query runs over the selected members only,
   exactly as `lore query --workspace` does. A task with no searchable term
   yields no hits rather than an unranked listing.
9. Fill the residual budget with deterministic first-fit. Scan ordered
   candidates, include one when the complete rerendered pack fits, otherwise
   mark it omitted and continue to smaller candidates. Each tentative pack is
   rendered with its own deduplicated query section, so a selection that swaps
   a longer hit into the section is admitted only if the whole pack still fits.
10. Render canonical Markdown, compute the chars-per-four estimate, and hash the
    exact bytes. Every successful pack is at or below `maxTokens`; `truncated` is
    true whenever any **eligible** candidate was omitted.

The zero-score exclusion (LCLI-680) is selection step 4 of the opum-doc
task-context contract — `docs/specs/opum-task-context-and-evidence-contract.md`
in opum-doc, "Exclude zero-score search candidates unless a mandatory policy or
task/graph relation independently requires them" — applied between ranking (step
6 above) and budget fill (step 9 above). Once the task's own terms actually rank
the deck — at least one candidate scores above zero — a candidate that scored
zero carries no relevance to this task and is excluded from the **eligible deck**,
rather than left to soak up leftover capacity, which is what that contract's step
6 forbids ("Never fill unused capacity with low-value sections"). A task that
tokenizes to no term, or that no candidate matches, leaves the whole deck at zero
— scoring produced no signal to separate candidates — so every candidate stays
eligible in declaration and section order; there, zero is "unrankable", not
"low value".

`total`, `shown`, and `truncated` are computed over that eligible deck, not over
every declared candidate. A zero-score exclusion removes a candidate from the
deck before any budget is spent, so it is not a budget cut and never sets
`truncated`: a pack that holds every candidate it was allowed to consider reports
`truncated: false` however many zero-score candidates it excluded. **Mandatory
anchors are never dropped for scoring zero.** The bundle's built-in Constitution
that a profile ranks in `sources` (the LCLI-609 dedupe case) is mandatory policy,
so it is kept even at zero score, and a profile's `pinned` evidence is a separate,
unranked tier that never enters this filter at all.

A zero-score exclusion stays **visible**: it is an omission carrying its own
truthful reason, never a silent disappearance. The catalog reports a source all
of whose candidates the exclusion emptied with the reason `omitted-by-relevance` —
a relevance omission, deliberately distinct from `omitted-by-budget` — so a
zero-relevance exclusion is never reported as a budget cut. Both reasons are
additive under the CLI contract's §7.1.

Repeated compilation over byte-identical profile, task, budget, bundle, and
retrieval inputs is byte-identical across indexed and reference paths. An agent
may rerun with a narrower task or larger budget, or use `lore read <id>` to
inspect a named omitted source exactly and without a budget. (`lore context <id>
--depth 0` is no longer the way to do that: since LCLI-478 a supplied
`--max-tokens` is a hard ceiling there too, so a depth-0 pack may drop the very
body the agent is trying to read.)

### Orchestrator contract

An orchestrator pack contains only its own pins and ranked evidence plus a
compact roster of direct delegates in declared order. The roster gives a native
orchestrator enough routing metadata to choose a worker; it does not inline
delegate source lists or bodies. Each native worker invokes `lore agent
context` independently for its assigned profile.

Host-specific nesting limits, tools, execution, permissions, and synthesis
remain outside Lore.

### Claude Code and Codex adapters

Lore's generated Claude and Codex skill guidance documents this one-line
convention:

> Lore profile: `<name>`. Before working, run `lore agent context <name> --task
> "<assigned task>"` and ground decisions in the returned source IDs.

Users place the line in a Claude agent's Markdown body or a Codex agent's
`developer_instructions`. Lore does not scan, create, rewrite, or validate
`.claude/agents/*.md` or `.codex/agents/*.toml`.

### Compatibility and deferred extensions

- The singular `agent` family is additive. The plural `agents` bridge command,
  existing command output, OKF profile type system, and projection schema remain
  unchanged.
- Local v1 covers one repository and one bundle. Workspace-qualified
  references wait for the accepted multi-repository workspace contract.
- Hosted synchronization, graph persistence, authorization, MCP tools, and web
  visibility require separate cross-repository contracts and are not implied.
- Profile loading and context compilation remain pure core modules behind thin
  command/file-output layers so a future transport can reuse them without
  becoming a local prerequisite.

## Open questions

None block local v1. Later proposals must independently decide:

- workspace-qualified profile references and conflict behavior;
- whether profiles participate in hosted synchronization and authorization;
- whether a structured `lore_agent_context` MCP tool is warranted; and
- whether measured corpora justify a different deterministic section threshold
  or tokenizer without changing the no-vector boundary.
