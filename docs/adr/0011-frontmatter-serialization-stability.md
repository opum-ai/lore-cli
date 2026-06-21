---
type: ADR
title: "ADR-0011: Frontmatter serialization & diff stability"
description: lore parses and re-serializes concept frontmatter with gray-matter under a frozen, stability-oriented configuration so that round-tripping an unchanged document is byte-identical — preserving key order, quoting, and unknown keys — and never stores bespoke lore metadata on Backlog.md tasks (which drop unknown keys on edit).
tags: [adr, frontmatter, gray-matter, serialization, idempotency, diff-stability, drift, backlog]
summary: lore round-trips concept frontmatter byte-identically via gray-matter with a frozen serializer config (stable key order, quoting, and unknown-key preservation), and keeps all lore metadata in docs rather than on Backlog tasks because Backlog drops unknown frontmatter keys.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0011: Frontmatter serialization & diff stability

## Status

Accepted — 2026-06-21

## Context

Every non-index concept file in the bundle begins with a YAML frontmatter
block (see [ADR-0006: Schema, types & templates](0006-schema-types-templates.md)).
lore both **reads** that frontmatter (to build the graph, validate shape,
compute status, answer queries) and **writes** it (`lore new`, `lore sync`,
`lore rename`, `lore supersede`, `lore replace`). The moment a command writes a
file, the entire frontmatter block is re-serialized from an in-memory object
back to YAML. How that serialization behaves is the difference between a tool
that produces clean, reviewable diffs and one that churns every file it touches.

Three product promises rest directly on serialization stability:

1. **Clean diffs.** A reviewer (human or agent) reading a PR must see *only*
   the field lore actually changed. If re-serializing reorders keys, re-quotes
   strings, reflows lists, or normalizes whitespace, every write becomes a noisy
   diff that buries the real change and makes review untrustworthy.

2. **Safe agent loops.** Agents run `edit → sync → check → commit` cycles. If a
   sync with no semantic change still mutates bytes, the working tree looks
   dirty, an unnecessary commit is created, and the loop may re-trigger — exactly
   the failure mode the managed-block design also guards against (see
   [ADR-0008: Managed task block via remark/mdast AST](0008-managed-block-remark-ast.md)).
   A no-op must be a *byte-level* no-op.

3. **A trustworthy CI drift gate.** `lore check` detects drift by regenerating
   managed content and comparing it to what is on disk (see
   [ADR-0007: Validation & coherence checking](0007-validation-and-coherence.md),
   exit code 6). That comparison is only meaningful if "regenerate an unchanged
   doc" reproduces the exact original bytes. Unstable frontmatter serialization
   would make the gate either flap with false positives or require fuzzy
   semantic comparison — both unacceptable.

There are also two correctness forces specific to frontmatter:

- **Unknown keys must survive.** OKF requires consumers (and therefore lore) to
  tolerate unknown frontmatter keys, and the schema layer deliberately lets
  user-defined keys pass through untouched (see
  [ADR-0003: OKF as the documentation substrate](0003-okf-substrate.md) and
  [ADR-0006](0006-schema-types-templates.md)). A serializer that silently drops
  keys it doesn't recognize would corrupt authors' data on the next write.

- **Quote-safety must be preserved, not "fixed."** `lore validate` includes a
  frontmatter quote-safety check. The serializer must emit quoting that is both
  YAML-correct and *stable* — it must not gratuitously add or strip quotes on
  values it didn't touch, or every write reopens settled quoting decisions.

Separately, the tempting shortcut of pushing lore's own metadata onto Backlog.md
tasks is a trap: **Backlog.md drops unknown frontmatter keys when it edits a
task file** (see [ADR-0002: Backlog.md integration — JSON-only](0002-backlog-integration-json-only.md)).
Any bespoke lore field written onto a task would silently vanish on the next
`backlog task edit`, so task metadata can never be a stable home for lore state.

## Decision

**Parse and re-serialize all concept frontmatter with
[`gray-matter`](https://github.com/jonschlinkert/gray-matter) under a single,
frozen, stability-oriented configuration, such that round-tripping an unchanged
document is byte-identical. Preserve key order, preserve existing quoting style,
and preserve unknown keys. Keep all lore-owned metadata in the docs bundle —
never on Backlog.md tasks.**

Concretely:

1. **gray-matter is the frontmatter boundary.** A single module
   (`src/core/concept.ts`) owns the `parse`/`stringify` round-trip. gray-matter
   splits the YAML frontmatter from the markdown body; lore mutates the parsed
   object and re-emits with gray-matter's `stringify`. No command reaches around
   this boundary to hand-edit YAML text.

2. **A frozen serializer configuration.** The YAML engine options (the
   `js-yaml`/`yaml` dump options gray-matter delegates to) are pinned in one
   place and reused by every write path. The configuration is chosen for
   stability over prettiness: a fixed indentation, `lineWidth` set so lists and
   long strings are **not** auto-wrapped/reflowed, a deterministic flow level,
   and no key sorting. This is the frontmatter analogue of the frozen
   `remark-stringify` config used for managed blocks
   ([ADR-0008](0008-managed-block-remark-ast.md)).

3. **Key order is preserved, never sorted.** lore emits keys in the order they
   were read from disk; newly added keys (e.g. a `status` lore computes, or a
   `superseded_by` from `lore supersede`) are appended in a defined position
   rather than triggering a global re-sort. An author's chosen field order is
   their decision and is treated as content.

4. **Existing quoting is preserved; new values are quoted minimally and
   deterministically.** lore does not re-quote values it did not change. When it
   must emit a new value, it applies the minimal YAML-safe quoting required for
   correctness (and quote-safety per
   [ADR-0007](0007-validation-and-coherence.md)) — the same value always
   producing the same quoting. (Bundle `timestamp` values are written as
   `2026-06-21T00:00:00Z`; dates are kept as ISO **strings**, never coerced to
   `Date` objects, per [ADR-0006](0006-schema-types-templates.md), which is part
   of what keeps them byte-stable.)

5. **Unknown keys round-trip verbatim.** The parsed frontmatter object retains
   every key — known *and* unknown — and `stringify` re-emits all of them.
   lore-managed commands mutate only the keys they own (`status`, `tasks`,
   `supersedes`/`superseded_by`, link refs) and leave every other key — including
   user-defined extensions — byte-identical. This is OKF's tolerance promise made
   operational at the write layer.

6. **The body is left to the body.** gray-matter handles only the frontmatter
   fence; the markdown body (including lore-managed regions like
   `<!-- lore:tasks -->`) is owned by the remark layer
   ([ADR-0008](0008-managed-block-remark-ast.md)). The two stay cleanly
   separated, and a frontmatter-only change never reflows body prose.

7. **Idempotent on no change.** Because key order, quoting, list formatting, and
   line width are all fixed, parsing a file and immediately re-serializing it
   without mutation yields the exact original bytes. `lore sync` writes nothing
   for an already-current doc, and `lore check` reports no drift.

8. **Proven with golden round-trip tests.** Byte-stability is a *tested
   invariant*, not an aspiration. A corpus of golden fixtures — covering
   multi-line strings, YAML lists, nested maps, quoted/unquoted values,
   unicode, CRLF/LF, BOM presence, blank-line padding around the fence, and
   unknown/custom keys — is parsed and re-serialized, with the test asserting the
   output is **byte-for-byte identical** to the input. A second tier of tests
   asserts that a targeted mutation (e.g. flipping `status`) changes *only* the
   expected bytes and leaves all other keys untouched. These tests are also the
   tripwire for dependency upgrades (see Consequences).

9. **lore metadata lives in docs, not on tasks.** No lore field is ever written
   onto a `backlog/tasks/*.md` file, because Backlog.md drops unknown keys on
   edit ([ADR-0002](0002-backlog-integration-json-only.md)). The doc → task
   linkage is authored in the **doc's** frontmatter (`tasks:`), and the optional
   task → doc back-reference is recorded the Backlog-approved, queryable way as a
   `doc:<conceptId>` **label** via `backlog task edit` — a first-class Backlog
   field that survives edits — not as a bespoke frontmatter key.

## Consequences

### Positive

- **Clean diffs by construction.** A write touches only the bytes that changed,
  so PRs show the real edit and reviews stay trustworthy — the core promise this
  ADR exists to keep.
- **Safe agent loops.** A semantic no-op is a byte-level no-op, so
  `edit → sync → check` cycles don't create phantom commits or re-trigger
  themselves (aligns with [ADR-0008](0008-managed-block-remark-ast.md)).
- **A drift gate that can be exact.** `lore check` compares regenerated bytes to
  disk bytes with no fuzzy matching and no false positives
  ([ADR-0007](0007-validation-and-coherence.md), exit 6).
- **OKF tolerance honored at the write layer.** Unknown and user-defined keys
  survive every round-trip untouched, satisfying OKF's extension-tolerance
  requirement ([ADR-0003](0003-okf-substrate.md),
  [okf-conformance](../reference/okf-conformance.md)).
- **No data loss across the Backlog boundary.** By keeping lore metadata in docs
  and using labels for task back-references, nothing is silently dropped by
  Backlog's unknown-key behavior ([ADR-0002](0002-backlog-integration-json-only.md)).
- **Battle-tested dependency, single boundary.** gray-matter is widely used and
  the entire round-trip is funneled through one module, so the stability contract
  has exactly one place to enforce and test.

### Negative / tradeoffs

- **Serializer coupling.** Byte-stability depends on pinned versions of
  gray-matter and its underlying YAML engine plus the frozen dump config. A YAML
  library upgrade can change default emission (quoting heuristics, line wrapping,
  number/null normalization). Mitigation: pin the versions, centralize the
  config, and let the golden round-trip tests fail loudly on any drift before it
  ships. A one-time, deliberate reflow on a major upgrade is acceptable.
- **We are at the mercy of YAML's emitter for new values.** lore fully controls
  the bytes of values it doesn't change, but values it *does* emit are formatted
  by the YAML library. We constrain this with minimal, deterministic quoting,
  but exotic values could still serialize in a way an author wouldn't hand-write.
  In practice frontmatter values are simple scalars and short lists.
- **"Preserve, don't beautify" can look inconsistent.** Because lore won't
  re-quote or re-order keys it didn't touch, two docs may legitimately differ in
  cosmetic frontmatter style. This is intentional — stability beats uniformity —
  but it means lore is *not* a frontmatter formatter, and a separate, opt-in
  normalization pass would be a distinct (non-default) feature.
- **No round-trip-perfect comment preservation.** YAML comments inside a
  frontmatter block are not guaranteed to survive serialization (the common YAML
  emitters drop them). lore's convention keeps the editor modeline *above* the
  `---` fence ([ADR-0006](0006-schema-types-templates.md)), so it is not subject
  to this; authors should not rely on in-frontmatter comments.

## Alternatives considered

- **Re-emit YAML with key sorting / a "pretty" normalizer.** Produces tidy,
  uniform frontmatter but reorders and re-quotes on every write, generating
  large spurious diffs and breaking the byte-identical no-op the drift gate
  needs. Rejected — uniformity is not worth sacrificing diff cleanliness and
  agent-loop safety.

- **Hand-roll a line-preserving YAML patcher** (locate the one key's line, splice
  in the new value, leave the rest of the text untouched). Maximally
  diff-minimal, but it re-implements a YAML parser badly: it breaks on multi-line
  scalars, anchors, flow collections, and quoting edge cases, and risks emitting
  invalid YAML. Rejected as fragile; gray-matter with a frozen config gets the
  same diff-minimality safely.

- **Use a `Date`-coercing or schema-driven serializer that rewrites the whole
  block from the typed object.** Cleanest conceptually, but it discards unknown
  keys and original ordering/quoting and would coerce ISO timestamps into `Date`
  objects, breaking both OKF tolerance and byte-stability. Rejected — see
  [ADR-0006](0006-schema-types-templates.md) on keeping dates as strings.

- **Store lore metadata on the Backlog.md task instead of in docs.** Tempting for
  "single source on the task," but Backlog.md drops unknown frontmatter keys on
  edit, so any lore field would silently disappear
  ([ADR-0002](0002-backlog-integration-json-only.md)). Rejected outright; the
  doc owns lore metadata, and task back-references use a durable `doc:` label.

- **Accept fuzzy/semantic comparison in the drift gate** (compare parsed objects,
  not bytes). Would tolerate an unstable serializer, but it weakens the gate
  (can't catch byte churn that pollutes diffs and dirties agent working trees)
  and is more complex. Rejected — make the serializer stable and the comparison
  can stay a simple byte equality
  ([ADR-0007](0007-validation-and-coherence.md)).

## Related

- [ADR-0002: Backlog.md integration — JSON-only via `--json`](0002-backlog-integration-json-only.md)
- [ADR-0003: OKF as the documentation substrate](0003-okf-substrate.md)
- [ADR-0006: Schema, types & templates — Zod as source of truth](0006-schema-types-templates.md)
- [ADR-0007: Validation & coherence checking](0007-validation-and-coherence.md)
- [ADR-0008: Managed task block via remark/mdast AST](0008-managed-block-remark-ast.md)
- [tech-stack](../reference/tech-stack.md) ·
  [backlog-cli-contract](../reference/backlog-cli-contract.md) ·
  [okf-conformance](../reference/okf-conformance.md) ·
  [lore-design spec](../specs/lore-design.md)
