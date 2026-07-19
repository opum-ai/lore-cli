---
type: ADR
title: "ADR-0008: Managed task block via remark/mdast AST"
description: How lore regenerates the <!-- lore:tasks:begin/end --> region in Story/Spec docs from live Backlog.md data using a remark/mdast AST, guaranteeing idempotent, byte-identical output and clean diffs for agent loops.
tags: [adr, managed-block, remark, mdast, idempotency, backlog, drift]
summary: lore rewrites the lore:tasks managed region from live Backlog data via a remark/mdast AST (never regex), producing byte-identical output when nothing upstream changed.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0008: Managed task block via remark/mdast AST

## Status

Accepted — 2026-06-21. Amended — 2026-07-02 (LORE-22): the serializer step
(item 3) is superseded — lore ships **no markdown serializer**, so the managed
block is built as a frozen-format **string** and spliced over the byte range
between the marker nodes, rather than re-serialized with `remark-stringify`.
mdast is still used, but only to *locate* the markers structurally; every other
guarantee below (structural location, marker validation, byte-identity, bounded
blast radius) is unchanged. See `src/core/managed-block.ts`.

Amended — 2026-07-19 (LORE-52): the Context/Decision/Consequences prose below also says lore
"depends on unified / remark (mdast)" or reuses "the remark stack" for this and other mdast-based
work. It never did — lore's only markdown dependency, then and now, is `mdast-util-from-markdown`
(a parser only; verified against `package.json`), not the `remark` or `unified` npm packages. This
is a separate, narrower correction than the LORE-22 amendment above (which was about the
serializer, item 3); the parser-dependency claim was never accurate. See
[tech-stack](../reference/tech-stack.md) (LORE-14).

## Context

A `Story` (and optionally a `Spec`) owns a set of Backlog.md tasks via its
`tasks:` frontmatter list. So that a human or agent reading the doc sees live
task status without leaving the file, lore maintains a **managed region** —
the text between the HTML-comment sentinels:

```markdown
<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [task-42](../../backlog/tasks/task-42%20-%20Bulk%20archive.md) | Bulk archive | Done |
<!-- lore:tasks:end -->
```

This region is regenerated from Backlog.md data on `lore sync`, and verified
(without writing) on `lore check`. Two properties are non-negotiable:

1. **Idempotency.** If nothing changed upstream, regenerating the block must
   produce **byte-identical** output. Spurious churn — reordered rows,
   whitespace drift, table-alignment wobble, trailing-newline flapping — turns
   every `lore sync` into a noisy diff, defeats the `lore check` drift gate
   (see [ADR-0011](0007-validation-and-coherence.md)), and is actively dangerous inside
   agent loops where a "no-op" sync that mutates bytes can trigger an
   unnecessary commit and a re-run.
2. **Boundary safety.** Everything **outside** the markers is the author's
   prose and must never be touched. Everything **inside** the markers is
   lore-owned and is overwritten wholesale — hand edits inside are discarded by
   design. The same managed-region discipline applies to every lore-owned
   block; refactoring commands like `lore replace` deliberately **skip**
   lore-managed regions for exactly this reason.

A naive implementation reaches for a regex over the raw markdown
(`/<!-- lore:tasks:begin -->[\s\S]*?<!-- lore:tasks:end -->/`) and string
splicing. That is fragile: it breaks when sentinels appear inside fenced code
blocks or blockquotes, mis-handles CRLF vs LF, drops or duplicates the
surrounding blank lines, and silently corrupts the file when the markers are
malformed or unbalanced. Because we already depend on **unified / remark
(mdast)** for the bundle's link graph, link rewriting, and portability work
(see [tech-stack](../reference/tech-stack.md) and
[portable-markdown](../reference/portable-markdown.md)), a real AST is available
at no extra cost.

Source data is **JSON-only** from the Backlog.md fork: lore parses
`backlog task view --json` / `task list --json` envelopes (see
[ADR-0003](0002-backlog-integration-json-only.md) and
[backlog-json-schema](../reference/backlog-json-schema.md)). There is no
`--plain` text fallback. Crucially, the JSON carries the task's
**`filePathRelative`** — the canonical, source-of-truth path to the task's
`.md` file under `backlog/` — which we must use rather than reconstructing a
filename from the display ID.

## Decision

**Regenerate the `<!-- lore:tasks:begin -->` … `<!-- lore:tasks:end -->`
region from live Backlog.md data by operating on a remark/mdast AST, not by
regex string-splicing. Guarantee byte-identical output when nothing upstream
has changed.**

Concretely:

1. **Locate the region structurally, not textually.** Parse the document with
   `mdast-util-from-markdown` (the parser lore already ships; *amended
   (LORE-22)* — not `unified().use(remarkParse)`, and **no GFM/table
   extension** is needed, since only the two comment nodes are read and the
   bytes between them are replaced wholesale). Walk the mdast for two `html`
   nodes whose values match the canonical `lore:tasks:begin` /
   `lore:tasks:end` sentinels at the top level of the tree (the node value is
   whitespace-trimmed before matching, since the parser keeps a marker line's
   leading indent and trailing spaces in the node value). Comment-shaped text
   that appears *inside* a `code` fence or other container parses as part of
   that node, not as a top-level `html` node, so it is never mistaken for a
   marker.

2. **Validate the markers before writing.** Exactly one balanced
   begin/end pair, begin before end, both at document top level. Missing,
   duplicated, unbalanced, or crossed markers are a hard error (validation
   failure, exit code 6) — lore refuses to guess and never writes a partial or
   corrupted block.

3. **Build the new content as a frozen string, then splice it in.** *Amended
   (LORE-22).* lore deliberately ships **no markdown serializer** — its only
   markdown dependency is `mdast-util-from-markdown` (a parser); there is no
   `remark-stringify`/`mdast-util-to-markdown` (ADR-0001 packaging constraint), and
   re-emitting the whole document would reflow the author's untouched prose (item 7
   forbids this). So the replacement is constructed as a **frozen-format string** —
   a GFM table (header `| Task | Title | Status |`, a compact `|---|---|---|`
   delimiter, one `| [id](link) | title | status |` row each), or a fixed
   `_No linked tasks._` paragraph when the `tasks:` list is empty — and **spliced
   over the byte range strictly between the two `html` marker nodes** (located via
   `node.position` offsets), copying every other byte verbatim. The frozen string
   format (not a serializer config) is what makes the output deterministic across
   runs and machines. This mirrors the settled string-splice pattern in
   `src/core/rewrite.ts` (`lore rename`/`supersede`) and `src/core/indexes.ts`
   (`lore:index` blocks); the shared engine lives in `src/core/managed-block.ts`.

4. **Determinism of row order and rendering.** Rows are emitted in a stable,
   defined order — the order of the doc's `tasks:` frontmatter list, with any
   tasks Backlog returns out-of-band appended in `task-N` numeric order — never
   in Backlog's response order. Each row renders `| [<display-id>](<link>) | <title> | <status> |`.
   Titles and statuses are taken verbatim from the JSON;
   table-cell-significant characters (`|`, leading/trailing whitespace) are
   escaped/normalized deterministically.

5. **Derive task links from `filePathRelative`; never reconstruct filenames.**
   The link target is computed from the JSON's `filePathRelative` (the task
   file's path relative to repo root), made relative to the doc's own location,
   then **URL-encoded, `.md`-suffixed, with no leading slash** per the bundle's
   link convention (see [ADR-0004](0010-multi-consumer-docs-layer.md)). This matters
   because **display IDs are uppercase while task filenames are lowercase**
   (e.g. display `task-42` vs file `task-42 - Bulk archive.md`, and more
   generally `TASK-42` display vs `task-42…` on disk) and titles contain spaces
   and punctuation. Reconstructing a filename from the ID would produce broken,
   non-portable links; the JSON path is the only correct source. The display ID
   shown in the link *text* comes from the JSON `id` field as-is.

6. **Byte-identical on no change.** Because location is structural, ordering is
   defined, links come from canonical JSON paths, and the block is emitted from
   a frozen-format string (*amended (LORE-22)* — the byte-stability rests on the
   fixed string format, not a serializer config), a regenerate over an
   already-current block reproduces the exact same bytes. lore can therefore
   compare new-vs-old and treat "no byte difference" as a genuine no-op: `lore
   sync` writes nothing, and `lore check` reports no drift. (This holds for
   LF-normalized input, which every lore read path guarantees — see
   `concept.ts` `normalizeInput`; the splice does not itself normalize line
   endings.)

7. **Idempotent surgery, bounded blast radius.** Only the nodes between the
   markers are replaced; the markers themselves and every node before `begin`
   and after `end` pass through the round-trip unchanged. To avoid remark
   reflowing the author's untouched prose, lore replaces only the managed
   sub-range and re-stitches the surrounding original source where practical, so
   a no-op sync cannot rewrite bytes the author owns.

The shared implementation lives in `src/core/managed-block.ts` and is driven
identically by `lore sync` (writes) and `lore check` (compares only). See
[cli-surface](../reference/cli-surface.md), the
[lore-design spec](../specs/lore-design.md), and
[backlog-cli-contract](../reference/backlog-cli-contract.md) for how the live
data is fetched.

## Consequences

### Positive

- **Clean diffs and safe agent loops.** A sync with no upstream change is a true
  no-op — zero bytes touched — so `lore sync` in a CI step or an agent's
  edit→sync→commit cycle does not generate phantom commits or trigger re-runs.
- **Drift detection is exact.** Because regeneration is deterministic,
  [`lore check`](0007-validation-and-coherence.md) can flag a stale managed block by a
  pure byte comparison, with exit code 6, and no false positives.
- **Robust against pathological markdown.** Sentinels inside code fences,
  blockquotes, or nested lists are not confused for markers, because location is
  structural (a top-level `html` node), not a text scan. *Amended (LORE-22):*
  line-ending normalization is **not** part of this engine — input is expected
  LF-normalized (every lore read path guarantees it via `concept.ts`
  `normalizeInput`), and the frozen string format fixes blank-line and
  table-alignment shape directly rather than deferring to a serializer.
- **Correct, portable links by construction.** Sourcing the path from
  `filePathRelative` sidesteps the uppercase-display-ID / lowercase-filename
  trap and emits links in the one cross-renderer-portable form
  ([ADR-0004](0010-multi-consumer-docs-layer.md)).
- **One AST, many uses.** Reuses the remark stack already present for the link
  graph, link rewriting, refactoring, and portability lint — no new core
  dependency, one mental model.
- **Composable with other lore-managed regions.** The same "structural locate,
  replace between markers, frozen serialize" pattern protects every managed
  block and is what lets `lore replace` safely skip them.

### Negative / tradeoffs

- **Format coupling.** *Amended (LORE-22).* With no serializer, byte-stability
  depends on the frozen table-string format in `managed-block.ts` and on the
  parser (`mdast-util-from-markdown`) assigning stable marker offsets — a much
  smaller surface than a `remark-stringify` config. A deliberate change to the
  frozen format is a one-time reflow; we mitigate with byte-identity (fixpoint)
  tests over the rendered block. Locating markers structurally still depends on
  the parser recognizing a top-level `html` comment node, which is CommonMark
  core (not a GFM extension), so it needs no table-parsing extension.
- **Heavier than a regex.** Parsing the whole document to mdast is more work per
  file than a single regex match. In practice doc files are small and `sync`/
  `check` are not hot paths, so the cost is negligible and bounded by bundle
  size.
- **Strictness can reject "almost-valid" docs.** Malformed or unbalanced markers
  are a hard error rather than a best-effort fix. This is intentional — silent
  partial rewrites are worse — but it means authors must keep both sentinels
  intact (lore's error message names the offending file and the exact problem).
- **Partial-source re-stitching is subtle.** Replacing only the managed range
  while preserving the author's exact surrounding bytes is more involved than a
  whole-document round-trip; it is covered by targeted tests asserting
  out-of-region bytes are untouched.

## Alternatives considered

- **Regex + string splicing over raw markdown.** Simplest to write, but
  fragile: breaks on sentinels inside fenced code/blockquotes, mishandles
  CRLF/LF and blank lines, and silently corrupts files on malformed markers.
  Rejected — it cannot give the byte-identical / boundary-safety guarantees the
  drift gate and agent loops require.

- **Line-range scanning (find begin line, find end line, replace lines in
  between).** Less brittle than a single multiline regex but still text-based:
  no awareness of code fences, and it re-implements ad hoc what the AST already
  models. Rejected for the same boundary-safety reasons.

- **Whole-document mdast round-trip (parse → stringify the entire file every
  time).** Clean structurally, but remark may reflow the author's untouched
  prose (list markers, emphasis style, wrapping), producing diffs outside the
  managed region and violating "everything outside the markers is yours."
  Rejected in favor of replacing only the managed sub-range and preserving
  surrounding source.

- **Reconstructing the task filename from the display ID** (e.g.
  `task-${id}.md` or slugging the title). Rejected outright: display IDs are
  uppercase, filenames are lowercase and contain the title with spaces and
  punctuation, so reconstruction yields broken, non-portable links. The JSON
  `filePathRelative` is the only correct source (see
  [ADR-0003](0002-backlog-integration-json-only.md),
  [backlog-json-schema](../reference/backlog-json-schema.md)).

- **Parsing Backlog.md `--plain` text instead of JSON.** Rejected per
  [ADR-0003](0002-backlog-integration-json-only.md) — no text-parser fallback; the
  managed block consumes the canonical JSON envelope only, which is also what
  supplies `filePathRelative`.

## Related

- [ADR-0003: Backlog.md JSON-only integration](0002-backlog-integration-json-only.md)
- [ADR-0004: Cross-link form (relative, URL-encoded, .md-suffixed)](0010-multi-consumer-docs-layer.md)
- [ADR-0011: `lore check` drift gate](0007-validation-and-coherence.md)
- [backlog-json-schema](../reference/backlog-json-schema.md) ·
  [backlog-cli-contract](../reference/backlog-cli-contract.md) ·
  [tech-stack](../reference/tech-stack.md) ·
  [portable-markdown](../reference/portable-markdown.md) ·
  [lore-design spec](../specs/lore-design.md)
