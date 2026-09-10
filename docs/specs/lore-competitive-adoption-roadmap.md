---
# yaml-language-server: $schema=../../.lore/schemas/spec.schema.json
type: Spec
title: Lore competitive adoption roadmap
description: >-
  What Lore should build to lead its field, derived from the 2026-08-12/13
  competitive research. Ranks candidates by value to an agent consuming the
  bundle over risk to the deterministic core, separates adopt from
  adopt-behind-a-flag from reject, and fixes one confirmed determinism defect
  first. Every candidate names the tool that already does it, the concrete
  command surface proposed for Lore, and whether it threatens determinism.
tags:
  - competitive
  - roadmap
  - adoption
  - okf
  - determinism
summary: >-
  Fix the wall-clock hole in `check`, then adopt the cheap credibility layer,
  then earn the context verb — rejecting anything that puts a model in the core.
timestamp: 2026-08-13T03:05:42.335Z
---

# Lore competitive adoption roadmap

## Summary

This Spec answers one question: **what should Lore build to be the best tool in
its field?** It is derived from
[the competitive feature matrix](../reference/lore-competitive-feature-matrix.md)
and [the landscape survey](../reference/competitive-landscape-agent-native-knowledge-tooling.md).

Three findings shape everything below.

**One: the positioning is wrong, and that is cheaper to fix than any feature.**
Nine surveyed tools have a deterministic no-LLM core. Six generate an agent
skill. Six traverse a graph. Those are the three things Lore's README leads
with, and none of them differentiates it. The one capability no surveyed tool
has is **task-tracker coupling with referential integrity in both
directions** — and the coupled tracker has the exact hole it fills, since
Backlog.md accepts a nonexistent `--doc` path with exit 0. Lead with that; let
determinism be the reason it can be trusted rather than the claim itself.

**Two: there is a confirmed determinism defect, and it sits inside the headline
claim.** `lore check --strict` can flip from pass to fail with no commit in
between. Nothing else in this document ships before it is fixed.

**Three: OKF is contested ground.** There are at least ten other
implementations. `okfcli` already has SARIF output and machine-readable command
self-description; `okf-ingest` already ranks context by exact Personalized
PageRank; ODS already has `adopt` for legacy trees. Lore is not defining this
category alone and cannot assume time.

The ordering principle throughout is **value to an agent consuming the bundle,
divided by risk to the deterministic core.** Exactly one candidate carries real
determinism risk, and it is quarantined behind a flag with an architectural
mitigation.

## Requirements

### R0 — Remove wall-clock dependence from every gate (delivered by LCLI-323)

`staleAfterFindings` in `src/core/check.ts` compares an OKF 0.2 concept's
`stale_after` against today's date; `--strict` promotes the resulting warning
to exit 6. The same unchanged commit therefore passes before that date and
fails after it. Verified empirically with a negative control on 2026-08-13
against this repository's source (a scratch 0.2 bundle carrying
`stale_after: 2020-01-01` produced `lore check` exit 0 and
`lore check --strict` exit 6).

The published `0.1.1` binary did not reproduce this because it did not
implement OKF 0.2 staleness semantics. Published `0.2.0` does, so the defect is
live there; the unreleased LCLI-323 fix closes it for the next release.

- **Delivered surface:** `check --as-of YYYY-MM-DD`, honored by every
  date-sensitive check rule. Without a pin, `check` reads HEAD's recorded
  committer calendar date; an unborn HEAD requires an explicit pin only when a
  discovered rule needs one. `validate`, `query`, and `context` have no
  elapsed-date rules, so they do not expose a meaningless flag. Any future
  date-relative rule must consume the same explicit input rather than reading
  the clock at its point of use.
- **Prior art:** claude-obsidian's `lint --as-of YYYY-MM-DD`.
- **Determinism:** strictly protective. This *increases* determinism.
- **Proof:** the regression suite includes a negative control whose elapsed
  `stale_after` fails under `--strict` at the default HEAD date and passes with
  an earlier `--as-of`. It also compares two equivalent pinned runs for the
  same exit code and byte-identical finding output.

### R1 — Stable rule IDs on every finding

Give every diagnostic a frozen identifier — `lore/link/dangling`,
`lore/schema/type-unknown`, `lore/task/doc-missing` — carried in the JSON
envelope's finding objects, with `--disable <id>` and `--only <glob>`.

Prior art: okfcli (`okf/links/broken`, `okf/frontmatter/type-required`),
OpenSpec (~25 named codes). Without IDs there is no suppression story and
message text cannot evolve without breaking consumers. **This is a prerequisite
for R2 and R3.** Effort small-to-medium; the real work is the ID registry and a
written stability policy. No determinism risk.

### R2 — Adoption ratchet: `--max-warnings N` and `--fail-on error|warn`

Let a repository turn the gate on today with 40 outstanding warnings and drive
the count down. Prior art: scaccogatto's `--max-warnings`, okf-gem's
`--fail-on`. Without it, `lore check` is all-or-nothing and adoption stalls at
the first legacy bundle. Effort small, no determinism risk, and it is the
single largest adoption unblocker in this list.

### R3 — SARIF 2.1.0 output

`lore check --format sarif --exit-zero` puts findings in GitHub's Security tab.
Prior art: okfcli, ODS (verified emitting valid SARIF with populated results).
Small once R1 lands, since SARIF wants stable rule IDs. No determinism risk.

### R4 — Machine-readable command self-description

One call returns every command, flag, argument, output kind, and exit code
inside the existing `{schemaVersion, kind, data}` envelope — say
`lore schema --surface` with `kind: "command-surface"`. Prior art: okfcli's
`okf schema [command]`.

Lore is unusually well placed here: the CLI is already parsed from a capability
manifest, so the data exists and only needs an exit. The value to an agent is
disproportionate — discovery collapses from N `--help` calls to one, and the
generated `SKILL.md` becomes *derivable* rather than hand-maintained. No
determinism risk.

### R5 — Determinism as a shipped test

`lore check --determinism` re-runs the pipeline and byte-diffs its own output,
plus a CI job asserting it **and a negative control proving the job can fail.**
Prior art: okf-rs's `generate --check-determinism`; okf-ingest's cross-language
parity harness locking R and Python to byte-identical catalogs.

Lore currently *asserts* determinism in prose. Two competitors *test* it. The
work is purging map iteration order, timestamps, and locale from all output —
which is also how R0 stays fixed.

### R6 — Task↔doc referential integrity as a named, rule-ID'd gate

Make it explicit that `lore check` fails when a Backlog task's `documentation[]`
names a nonexistent doc, when a `doc:<conceptId>` label points at no concept,
and when a Story claims a task that does not exist — under
`lore/task/doc-missing`, `lore/task/label-dangling`, `lore/story/task-missing`.

**This is the differentiator, so it must be the most legible thing in the
product.** Much of it is likely already implemented; the work may be naming,
documenting, and proving it rather than building it. Confirm before scheduling,
and re-verify the Backlog.md `--doc` behaviour at 1.50.x before any external
claim rests on it.

### R7 — Ranked, budgeted `lore context`

Rank the returned neighbourhood by **exact Personalized PageRank** over the
author-written link graph, with `--rank bfs` for plain depth, a hard token
budget, and the achieved token count reported in the envelope:
`lore context <id> --rank ppr|bfs --budget 8000 --depth N`.

Prior art: okf-ingest (`--rank ppr`, exactness locked by a cross-language
conformance suite), ODS (bounded reading list plus `ods bench` token ROI).

PPR is deterministic linear algebra — no model. The only hazard is
floating-point tie-breaking; fix it with a stable secondary sort on concept ID
and a fixed iteration count. Pick a token-counting method and pin it, or count
characters and say so. **This is the verb an agent actually calls, and the
highest-value additive item here.**

### R8 — Legacy adoption: `lore adopt` and `lore migrate`

`lore adopt docs/legacy --dry-run` emits a JSON plan drafting frontmatter as
`status: draft`; `lore migrate --from 0.1` performs the 0.1→0.2 upgrade
(`timestamp` → `generated.at`, body `# Citations` → `sources:`). Prior art: ODS
`adopt`, scaccogatto `--migrate`.

Lore has `init` and `new` — nothing for the 200 markdown files a repository
already has. This is pure funnel. `--dry-run` must be the default.

### R9 — Packaged CI surface

A published composite Action wrapping `lore check` with `bundle`, `fail-on`,
`max-warnings`, and `as-of` inputs, plus `lore setup --git-hooks`. Prior art:
scaccogatto's Action — which works in repositories **with no agent at all**, a
distribution channel Lore does not currently have. Note this repository already
ships a private `strict-check` composite action for org-internal use; R9 is the
public analogue.

**The action's final command must be unpiped** so a nonzero exit fails the job.
A piped exit code reports the wrong process's status and produces the most
confident possible false clear.

### R10 — Reviewer-facing impact report and merge gate

`lore impact --since <ref> --format review --fail-on-risk N`, emitting
sticky-comment-ready markdown with an HTML marker. Prior art: okf-rs's
`review <ref-a> <ref-b> --fail-on-risk`.

Steal okf-rs's *framing* as well as its feature. Because a Lore bundle **is**
the artifact rather than a binary index, a mis-resolved edge shows up as a red
line in a PR diff to a reviewer who has never run the tool. That is the
strongest available argument for file-first design, and Lore is not currently
making it.

### R11 — `lore conformance`

A machine-readable statement of exactly where Lore diverges from OKF §11 —
registered types with per-type schemas, broken links as errors, unknown-key
handling — each divergence carrying a rule ID and a rationale.

Note the prose already exists and is good:
[OKF conformance](../reference/okf-conformance.md) separates the permissive OKF
floor from Lore's producer profile from Lore's coherence gates. Only the
command is missing. The ecosystem is genuinely split here — okf-gem states
"broken links are warnings by design", scaccogatto makes them fatal only under
`--strict`, okfcli makes them exit 1 — so being strict is defensible. Being
strict *silently* would not be, and Lore is already not doing that.

### R12 — Audit: never store a derived value

Confirm trust tier and staleness are computed at read time and stored nowhere.
OKF marks trust tiers DERIVED and never-stored; scaccogatto's rationale is that
"a stored tier is a stored opinion, and it goes stale". Audit only, no code
expected. Free correctness.

## Design

### Adopt behind a flag

**F1 — MCP server, read-only by default.** `lore mcp --mode read`, with
`--allow-writes` explicit, an output schema on every tool, and MCP behavior
hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).
Prior art: Foam (25 tools, required `mode`), okf-mcp, okf-gem, zetl (scoped
signed-JWT delegation), basic-memory (hints on every tool).

MCP is transport, so it carries no determinism risk — but it is a long-running
watching process, a different failure model from a one-shot invocation, and
**MCP errors are JSON-RPC codes, not process exit codes**. An MCP-first Lore
would silently forfeit the CI-gate story that separates it from a prompt
methodology. Ship the CLI as the contract and MCP as a projection of it. Note
also that MCP's change signal is a payload-free ping with no diff, so
`snapshot` and `changed` must be exposed as tools or the server is strictly
worse than the CLI. This revisits [ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md)
and [ADR-0018](../adr/0018-persistent-local-graph-projection-with-ladybugdb.md)
on new evidence — the deferral reasoning still holds for *primacy*, but "most
common capability in the field, and the coupled tracker ships one" is a new
fact those decisions did not have.

**F2 — Blast-radius write guards.** `replace`, `rename`, `supersede`, `sync`,
and `link` declare how much they may touch; everything validates before
anything is written; an over-budget operation aborts naming the offenders:
`lore replace <a> <b> --expect-docs 4`. Prior art: iwe's `expect` guards
(verified aborting with exit 2 and naming each document; **mandatory over
MCP**), and claude-obsidian's plan/approve/apply gated on an
`approved_plan_sha256` bound to the vault root.

Deterministic and it makes agent writes auditable. Flagged only because making
guards mandatory on the CLI immediately would break existing scripts: opt-in on
the CLI, **mandatory whenever F1's `--allow-writes` is on.**

**F3 — Semantic search, strictly non-gating.** `lore query --semantic` only —
never reachable from `check`, `validate`, or any exit-code-bearing command.

**This is the only candidate here with real determinism risk**, and the
mitigation must be architectural rather than procedural: the deterministic
lexical result is the **floor that a rerank permutes**, never a separate path
that can fail differently. claude-obsidian is the model — a BM25 floor with an
optional local cosine rerank whose failure reverts the *entire* result set to
BM25 order, never mixing score scales. If that invariant cannot be held, reject
this outright.

**F4 — Watch mode / LSP.** Prior art: iwe (VS Code/Neovim/Zed/Helix), ODS
`ods lsp`, Foam. No determinism risk, large scope. Lowest priority — deliberately
deferred remains a fine answer.

**F5 — Multi-bundle registry.** okf-gem's `okf registry set ./docs` makes a
bundle addressable as `@docs` from any directory. Useful, but a per-user
registry is machine state outside the repository, which cuts against
repo-residency. Default off.

### Reject, and why

| Reject | Why |
|---|---|
| **Any LLM in the core** | The whole thesis. openwiki needs one of 12 providers; the GCP reference agent's only verbs are `enrich` and `visualize`; Kiro requires an AWS account. Adding one forfeits the only axis on which Lore beats a 14,956-star competitor. |
| **Telemetry** | `okn` ships telemetry **on by default**. That is a differentiator handed over for free; do not surrender it. |
| **Becoming a task tracker** | Lore *couples*; Backlog.md *owns*. Duplicating task state creates two sources of truth and destroys the one thing Lore is uniquely good at. |
| **Forking OKF into a Lore-native spec** | ODS already occupies the rival-spec slot and has 4 stars for its trouble. Interoperate; diverge only as a declared strict superset (R11). |
| **Bi-temporal graph with contradiction-driven invalidation** | Graphiti is state of the art and its invalidation is **two LLM calls deep**. Git already gives Lore transaction time via `snapshot`/`changed`; OKF gives valid time via `status` and `stale_after`. A second temporal model is scope with no consumer. |
| **A viewer as a primary investment** | Quartz (12,996 stars) is a publishing pipeline with nothing to query from a terminal; openwiki's `visualize` loads libraries from a public CDN and is not even offline. Lore has `explorer`; cap the investment there, and keep any HTML export a single self-contained file with no CDN. |
| **A hosted anything** | mem0's MCP is hosted-only — "nothing runs on your machine". Repo-residency is the product. |
| **Chasing star-count features** | BMAD has 51,829 stars and a three-command CLI with no validator; spec-kit has 126,484 and its `analyze` is a prompt. Stars here measure distribution, not machinery. |
| **Treating llms.txt or AGENTS.md as rivals** | llms.txt explicitly rejects YAML frontmatter — no type, no trust family, no graph. Both are **export targets**: `okn export html` writes an llms.txt into its bundle, and okf-rs's `init` writes AGENTS.md with CLAUDE.md as a one-line import. Worth adopting as outputs, never as the model. |

### Sequencing

1. **R0** alone — the correctness fix, with its negative control. Nothing else ships first.
2. **R1 → R2 → R3 → R4** — the credibility layer. All small, all zero-risk, and
   R1 unlocks the rest. This is where Lore stops being behind okfcli.
3. **R6, R11, R12** — mostly naming and proving what already exists; cheap, and
   R6 is the differentiator becoming legible.
4. **R5, R9, R8** — determinism proof, then distribution, then the adoption funnel.
5. **R7** — the highest-value additive feature, once the foundations hold.
6. **R10**, then **F1/F2** together, then reassess.

## Open questions

- **Is R6 already shipped?** If task↔doc referential integrity is not yet
  gated, it moves to position 1 and outranks everything except R0.
- **Which token counter for R7's budget?** `lore context` currently documents a
  labeled chars/4 estimate. Pin a real tokenizer, or keep the estimate and
  state plainly that the budget is approximate. Do not leave it ambiguous.
- **Does the ODS framing need a written answer?** ODS publishes the claim that
  OKF is for data and knowledge assets while ODS is for docs describing
  software systems. If accepted, Lore is applying the wrong spec to a code
  repository. The counter-argument — that Lore's concepts are *decisions about*
  a system rather than *descriptions of* it, and that OKF's trust, staleness,
  and provenance families are exactly right for decisions that rot — is
  probably correct but is currently unwritten. This may warrant its own ADR.
- **Does F1 change [ADR-0004](../adr/0004-cli-first-skill-bridge-mcp-deferred.md)?**
  The idle-token argument against MCP primacy still stands. What has changed is
  that MCP is now near-universal in this field and Backlog.md itself ships a
  20-tool server. A superseding ADR — MCP as an explicitly secondary,
  read-default projection — may be the honest record.
- **Re-verify Backlog.md at 1.50.x** before the `--doc` exit-0 finding appears
  on any external surface.
