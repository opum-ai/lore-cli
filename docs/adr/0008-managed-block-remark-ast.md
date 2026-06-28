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

Accepted — 2026-06-21

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
   `remark` (`unified().use(remarkParse)` with GFM enabled for tables). Walk
   the mdast for two `html` nodes whose values match the canonical
   `lore:tasks:begin` / `lore:tasks:end` sentinels at the top level of the
   tree. Comment-shaped text that appears *inside* a `code` fence or other
   container parses as part of that node, not as a top-level `html` node, so it
   is never mistaken for a marker.

2. **Validate the markers before writing.** Exactly one balanced
   begin/end pair, begin before end, both at document top level. Missing,
   duplicated, unbalanced, or crossed markers are a hard error (validation
   failure, exit code 6) — lore refuses to guess and never writes a partial or
   corrupted block.

3. **Build the new content as mdast nodes, then serialize once.** Construct the
   replacement — a GFM `table` node (plus a "no linked tasks" paragraph when the
   `tasks:` list is empty) — as mdast and replace the run of nodes strictly
   *between* the two `html` marker nodes. Serialize the whole document with
   `remark-stringify` (`remark-gfm`) using a **single fixed configuration**
   (bullet, emphasis, fence, list-indent, `tablePipeAlign`, `incrementListMarker`,
   `setext: false`, etc.). A frozen serializer config is what makes the output
   deterministic across runs and machines.

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
   defined, links come from canonical JSON paths, and serialization uses a
   frozen config, a regenerate over an already-current block reproduces the
   exact same bytes. lore can therefore compare new-vs-old and treat "no byte
   difference" as a genuine no-op: `lore sync` writes nothing, and `lore check`
   reports no drift.

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
  blockquotes, or nested lists are not confused for markers; CRLF/LF, blank-line,
  and table-alignment handling come from the serializer, not from hand-rolled
  string math.
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

- **Serializer coupling.** Byte-stability depends on a pinned remark/remark-gfm
  version and a frozen `remark-stringify` config. A remark upgrade can change
  default formatting; we mitigate with the pinned config, snapshot tests over
  the rendered block, and a one-time reflow being acceptable on deliberate
  upgrades.
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
