---
type: ADR
title: "ADR-0007: Validation & coherence checking"
description: Why lore splits document checking into a tiered, schema-driven `lore validate` and a deterministic CI drift gate `lore check`, both pure-JS with no Rust runtime dependency.
tags: [adr, validation, coherence, check, ci, links, okf]
summary: lore separates per-document validation from deterministic cross-bundle coherence checks for status, links, anchors, and portability.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0007: Validation & coherence checking

## Status

Accepted — 2026-06-21

Amended — 2026-06-25 (LCLI-46): the **Tier-2 per-type contract is now profile-driven**. A type's
required body sections come from the `sections` array of its `[[types]]` entry in
`.lore/profile.toml` (see [ADR-0006 amendment](0006-schema-types-templates.md) and
[ADR-0013](0013-lore-state-directory.md)), and its frontmatter shape from the generated per-type
validator — both derived from the declarative profile rather than hand-authored in code. The
tiers themselves are unchanged: a missing required section / mistyped known field = Tier-2
**error**; an unknown type or extra key = Tier-3 **warning**. Section matching is unchanged
(heading text, depth ≤2, order not enforced). A type with no declared `sections` (and every
unknown type) has no section contract, preserving OKF tolerance.

Amended — 2026-06-26 (LCLI-47): the bundle's **`log.md` is a `sync`-time materialized artifact,
excluded from `lore check`'s regenerate-and-compare drift gate.** Unlike `index.md` and the
`<!-- lore:tasks -->` managed blocks — which are deterministic functions of the bundle/Backlog state
and stay gated — `log.md` is derived from git commit history (via the `GitAdapter` seam, see
[ADR-0014 amendment](0014-core-has-no-llm-dependency.md)) and so changes on *every* commit, including
the gate's own. Gating it would report permanent drift and break on shallow/read-only CI checkouts
that lack full history. `lore sync` writes `log.md`; `lore check` neither regenerates nor compares it.

Amended — 2026-07-19 (LCLI-52): every mention below of `remark-validate-links`, `remark-lint`,
or "the remark/mdast pipeline" describes this ADR's original 2026-06-21 plan, not what shipped.
lore has never depended on the `remark`, `unified`, `remark-validate-links`, or `remark-lint`
npm packages (verified against `package.json` and every `src/` import — see
[tech-stack](../reference/tech-stack.md), LCLI-14). Internal link/anchor validation and the
portability lint are hand-rolled directly over the mdast tree `mdast-util-from-markdown` produces
(`src/core/bundle.ts`, `src/core/check.ts`, `src/core/links.ts`), not a call into any remark
package. The decision itself is unaffected: pure-JS, no Rust/native runtime, MDX-safe (unlike
markdownlint), and a deterministic internal-by-default gate — only the specific tooling named
below was never actually adopted; hand-rolled code achieves the same properties.

Amended — 2026-07-30 (dependency-boundary reconciliation): package-specific
`gray-matter` references below are historical. The current quote-safety and
frontmatter validation paths use the Lore-owned fence boundary plus exact-pinned
`js-yaml`, as recorded by the ADR-0011 amendment. The validation tiers and
byte-stability requirements are unchanged. `LCLI-287` may delegate only the
generic GitHub slug/duplicate primitive to `github-slugger`; cross-document
checking, portable-link policy, and finding semantics remain Lore-owned. See the
[dependency boundary audit](../reference/dependency-boundary-audit.md).

## Context

lore must answer two distinct questions about a docs bundle, and conflating
them produces a tool that is either too noisy to trust or too lax to gate CI:

1. **Is each document well-formed?** Does the frontmatter parse, does it carry
   a `type`, does a known `type` satisfy its required shape and sections, and
   are the YAML values quote-safe? This is a per-file, schema-driven question.
2. **Is the bundle coherent?** Do declared `Story` statuses match the live
   Backlog.md task rollup, are the `<!-- lore:tasks -->` managed blocks current,
   do internal cross-links and heading anchors actually resolve, and is the
   markdown portable across our target renderers? This is a whole-bundle,
   stateful question that belongs in CI.

Several constraints shape the design:

- **OKF tolerance is mandatory.** The Google Open Knowledge Format v0.1 requires
  only `type`, treats everything else as producer-defined, and explicitly
  instructs consumers to **tolerate unknown types, unknown keys, and broken
  links** (OKF §9). A validator that errors on extension keys or unknown types
  would violate the format it claims to enforce. See
  [OKF conformance](../reference/okf-conformance.md).
- **Zero-config / bunx-friendly is non-negotiable.** lore is meant to run via
  `bunx @salient-data/lore` with nothing else installed. Any checker that pulls
  in a **Rust/native runtime** (lychee for links, Vale for prose) breaks that
  promise: it adds a non-JS toolchain, platform binaries, and install latency
  to the hot path. See [tech-stack](../reference/tech-stack.md).
- **markdownlint cannot parse MDX.** Because lore scaffolds Docusaurus (which
  parses docs as MDX) and we allow raw `<` / `{` under `markdown.format:'detect'`,
  a CommonMark-only linter mis-tokenizes valid bundle files. We need a checker
  built on the same **remark/mdast** pipeline lore already uses for managed-block
  surgery and link rewriting.
- **Always-on external link checking is a trap.** Network 404s and timeouts are
  flaky and non-deterministic; an external-by-default gate fails for reasons
  unrelated to the change under review, which trains contributors to add
  `|| true` or `--no-verify` and bypass the gate entirely. A CI gate must be
  **deterministic** to be trusted.
- **The core must stay LLM-free and deterministic.** Both commands are pure
  graph/AST/schema operations; no model, no heuristics, no ranking.

## Decision

Split checking into two commands with sharply different jobs and exit
semantics. Both are pure-JS, both honor the global output modes
(`--json > --plain > pretty`), and both follow the
[CLI contract](../reference/cli-contract.md) exit codes.

### `lore validate` — tiered, per-file conformance

`lore validate` is schema-driven by the Zod source of truth (see
[ADR-0005: Schema, types & templates](0006-schema-types-templates.md)) and
reports findings in three tiers:

| Tier | Finding | Severity | Rationale |
|---|---|---|---|
| 1 | **OKF §9 conformance** — frontmatter is unparseable, or `type` is missing/empty | **error** | The single hard requirement of OKF; a non-conforming file is not an OKF concept at all. |
| 2 | **Per-type shape** — a *known* `type` (Reference/Spec/ADR/Runbook/Epic/Story) fails its strict Zod schema or is missing a required section/heading | **error** | The story-convention producer profile is a contract; a `Story` without acceptance criteria, or with the wrong field types, is a defect. |
| 3 | **Extensions** — an *unknown* `type`, or extra/unrecognized frontmatter keys on a known type | **warning** | OKF §9 forbids us from rejecting these. We surface them so drift is visible, but never fail the file. |

Cross-cutting all tiers is a **frontmatter quote-safety** check: YAML scalars
that would be mis-parsed or silently coerced (unquoted strings starting with
`@`, `:`, `>`, `|`, leading `*`/`&`, bare `yes`/`no`/`on`/`off`, dates that
need quoting, colons inside unquoted values) are flagged so a round-trip
through gray-matter is byte-stable. Quote-safety problems that change parse
semantics are **errors**; cosmetic ones are **warnings**.

Validation is **per-file and stateless** — it never shells out to Backlog.md
and never touches the graph. `lore validate` exits `6` (validation-or-drift)
if any error-tier finding exists, `0` otherwise. Warnings alone do not change
the exit code.

### `lore check` — deterministic CI drift gate

`lore check` is the read-only, whole-bundle gate intended to run in CI. It
**never writes** (that is `lore sync`'s job); it reports drift and exits `6`
when the working tree is not in the reconciled, coherent state `lore sync`
would produce. It composes four deterministic passes:

1. **Status reconciliation.** Recompute each `Story`'s status from the live
   Backlog.md task rollup (via the JSON adapter — see
   [backlog-cli-contract](../reference/backlog-cli-contract.md)) and report any
   `Story` whose persisted `status` differs from the computed value. Pure
   comparison; no write.
2. **Managed-block drift.** Re-render every `<!-- lore:tasks:begin -->` …
   `<!-- lore:tasks:end -->` region from current task data and byte-compare
   against the file on disk. Because rendering is idempotent, a clean tree
   produces zero diff; any difference is drift.
3. **Internal cross-link & heading-anchor validation.** A single whole-bundle
   pass with **pure-JS `remark-validate-links`** over the shared remark/mdast
   pipeline. **Internal-by-default**: every relative `.md` link target must
   exist, and every `#anchor` must resolve to a real heading slug in the target
   file. External-link **liveness** is **opt-in only** via `--external` (and is
   excluded from the default deterministic gate; see Consequences). Links are
   validated in the portable form mandated by
   [ADR-0008: Portable cross-links](0010-multi-consumer-docs-layer.md) and
   [portable-markdown](../reference/portable-markdown.md).
4. **Portability lint — detection only.** Flag non-portable markdown syntax
   (wikilinks, leading-slash absolute links, missing `.md` suffix, non-URL-
   encoded paths) as **warnings**. `lore check` detects; it does not promise
   cross-renderer parity — that is the consumers' responsibility.

`lore check` exits `6` on any drift or any internal link/anchor failure;
portability findings are warnings and do not, on their own, fail the gate
(unless explicitly promoted via config). The full command surface is documented
in [cli-surface](../reference/cli-surface.md).

### What lore deliberately does *not* run in the default path

- **No lychee / lychee-action** (Rust) for links — replaced by pure-JS
  `remark-validate-links`.
- **No Vale** (Go/Rust) for prose linting — out of scope for the deterministic
  core.
- **No markdownlint** — cannot parse MDX; we use remark-lint rules on the same
  mdast.

These heavier tools are offered **only through the optional CI scaffold**
(`lore scaffold`, see [ADR-0009: Browsable consumer scaffolding](0010-multi-consumer-docs-layer.md)),
which emits workflow files a team may opt into. They are never a runtime
dependency of the `lore` binary and never required for `bunx` usage.

## Consequences

### Positive

- **Trustworthy CI gate.** Because `lore check`'s default passes are fully
  deterministic (graph, AST, frontmatter, local Backlog.md JSON), a failure
  always means a real, reproducible problem — so the gate is respected rather
  than bypassed.
- **Honors OKF.** Tier-3 warnings let unknown types and extension keys flow
  through untouched, satisfying OKF §9 while still surfacing them.
- **Zero-config preserved.** No Rust/native binary on the hot path; `bunx`
  works with nothing else installed.
- **One pipeline.** remark/mdast is reused across managed-block surgery, link
  rewriting, and link/anchor validation — one parser, one notion of "a link",
  one notion of "an anchor slug" — so validation matches rewrite behavior
  exactly.
- **Clear separation of concerns.** `validate` answers "is this file correct?"
  per-file and offline; `check` answers "is the bundle coherent?" across the
  whole graph. Agents and humans can run the cheap per-file check locally and
  reserve the stateful gate for CI.
- **Schema-as-truth.** Per-type validation derives directly from the Zod
  schemas, so adding a field or required section changes validation, JSON
  Schema, and editor autocomplete from one place.

### Negative / tradeoffs

- **External links are not gated by default.** A doc can link to a dead external
  URL and pass `lore check`. This is an accepted tradeoff: we judge a
  deterministic-but-incomplete gate strictly better than a flaky one that gets
  bypassed. Teams that want liveness can run `lore check --external` on a
  separate, non-blocking schedule (e.g. a nightly job), where transient 404s do
  not block merges.
- **No prose/style linting in core.** Spelling, tone, and house-style live in
  the optional Vale scaffold, not the binary. The core makes no prose-quality
  guarantees.
- **MDX coupling.** Choosing remark/MDX-aware tooling means we cannot reuse the
  large markdownlint rule ecosystem; we maintain a smaller curated set of
  remark-lint rules instead.
- **`check` needs Backlog.md present.** Status-reconciliation and managed-block
  passes require the `--json`-capable Backlog.md fork (see
  [ADR-0003: Backlog.md integration](0002-backlog-integration-json-only.md) and
  [backlog-json-patch](../runbooks/backlog-json-patch.md)). `lore validate`
  has no such dependency and remains runnable anywhere.

## Alternatives considered

- **One unified `lore lint` command.** Rejected: merging per-file conformance
  with stateful, Backlog.md-dependent drift detection forces every local
  invocation to shell out to Backlog.md and walk the graph, and muddies exit
  semantics. Two commands keep `validate` fast/offline and `check` authoritative.
- **lychee (Rust) for link checking.** Fast and feature-rich, but a native
  binary breaks zero-config `bunx` and adds per-platform packaging. Offered only
  in the opt-in CI scaffold, never as a runtime dependency.
- **markdownlint as the linter.** Rejected: it is CommonMark-only and
  mis-parses the MDX/raw-`<`/`{` content Docusaurus accepts, producing false
  positives on valid bundle files. remark-lint on the existing mdast pipeline
  avoids this.
- **External link checking on by default.** Rejected: non-deterministic network
  failures train contributors to bypass the gate, defeating its purpose. Made
  strictly opt-in via `--external`.
- **Erroring on unknown types / extra keys.** Rejected: directly violates OKF §9
  consumer-tolerance. Demoted to tier-3 warnings.
- **Treating portability problems as errors.** Rejected: lore detects
  non-portable syntax but does not guarantee cross-renderer parity, so these are
  warnings, leaving the parity contract with the consumer toolchain.

---

See also: [lore-design](../specs/lore-design.md),
[cli-contract](../reference/cli-contract.md),
[consumer-compatibility](../reference/consumer-compatibility.md),
and the [ADR log](index.md).
