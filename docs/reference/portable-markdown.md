---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: Portable Markdown — the subset lore guarantees
description: >-
  The portable Markdown subset lore writes and lints for, the cross-renderer
  link form it requires, and the Obsidian-specific and MDX-unsafe syntax it
  detects (warn-only, detection-only) so a docs/ bundle renders the same on
  GitHub, Obsidian, MkDocs, and Docusaurus.
tags: [markdown, portability, obsidian, mdx, docusaurus, mkdocs, lint, links]
summary: >-
  lore writes and lints a portable GitHub-flavored Markdown subset — relative,
  URL-encoded, .md-suffixed links and no Obsidian-isms or MDX-unsafe raw
  characters — and detects (but does not auto-convert) non-portable syntax.
timestamp: 2026-06-21T00:00:00Z
---

# Portable Markdown

A `docs/` bundle produced by lore has to render correctly in four very different
places at once: rendered on **GitHub**, edited and graphed in **Obsidian**,
built as a static site by **MkDocs (Material)**, and built as a static site by
**Docusaurus (MDX)**. No single Markdown flavor is the union of all four — each
adds extensions the others choke on. lore's answer is a deliberately small
**portable subset**: write only what all four agree on, and **detect** (warn,
never silently rewrite) anything that would break one of them.

This page is the normative description of that subset. It is the contract the
[portability lint](#the-portability-lint) enforces and the rationale behind the
[link form](#the-link-form) decision. For the per-renderer matrix of what
survives where, see [consumer compatibility](consumer-compatibility.md). For the
broader link rules and how they interact with OKF §5, see
[OKF conformance](okf-conformance.md).

> **lore detects; it does not convert.** The portability lint is
> **detection-only** and emits **warnings** — it will tell you that a
> `[[wikilink]]` or a raw `<Component>` will not survive every renderer, but it
> will **not** rewrite your prose. An automatic `--fix` converter (wikilinks →
> relative links, callouts → admonitions, etc.) is **deferred**; today the human
> or agent fixes the flagged lines. The one exception is link *form* on files
> lore itself authors (`lore new`, `lore rename`, `lore supersede`,
> `lore link`): there lore always emits the portable link form to begin with.

---

## What you can rely on (the portable subset)

lore targets **GitHub-Flavored Markdown (GFM)** intersected with what MkDocs and
Docusaurus render out of the box. Concretely, the following are portable and are
what lore writes:

- **ATX headings** (`#`–`######`). One H1 per document, matching the
  frontmatter `title`. Anchors are GitHub-style slugs (lowercased, spaces →
  `-`, punctuation stripped); `lore check` validates that every in-bundle
  `#anchor` link resolves to a real heading.
- **GFM tables**, **fenced code blocks** with language hints, **task lists**
  (`- [ ]`), **blockquotes**, ordered/unordered lists, **strikethrough**
  (`~~…~~`), inline code, bold/italic.
- **Standard links and images** in the [required link form](#the-link-form).
- **HTML comments** (`<!-- … -->`) — used by lore's own managed regions
  (`<!-- lore:tasks:begin -->` … `:end`). These render as nothing everywhere and
  are safe. (Note: this is *not* the same as Obsidian `%% … %%` comments, which
  are not portable — see below.)
- **YAML frontmatter** fenced by `---`. Every consumer either renders it as page
  metadata (MkDocs/Docusaurus) or hides it (Obsidian) or shows it as a small
  table (GitHub). lore's [quote-safety](okf-conformance.md) rules keep the YAML
  parseable across all four parsers.

Anything outside this set is either a hard portability problem (the lint warns)
or simply untested across renderers — lore does not guarantee parity for
extensions it does not write. Cross-renderer fidelity beyond this subset is the
**consumer's** responsibility, not lore's; see
[consumer compatibility](consumer-compatibility.md).

---

## The link form

Every cross-link inside the bundle **must** be:

> **relative · URL-encoded · `.md`-suffixed · no leading slash**

```markdown
[orders reference](../reference/orders.md)
[an ADR](../adr/0007-soft-deletes.md)
[a heading](../reference/orders.md#archival-policy)
[a path with spaces](../reference/order%20schema.md)   <!-- space → %20 -->
```

This is the **only** form that works simultaneously across GitHub, Obsidian
(including graph view and backlinks), MkDocs, and Docusaurus. Each property is
load-bearing:

| Property | Why it is required |
|---|---|
| **Relative** (`../reference/orders.md`) | The bundle has no single deploy root. GitHub serves from the repo path; MkDocs/Docusaurus from a site subpath; Obsidian from the vault root. Only repo-relative paths resolve in all of them. |
| **No leading slash** | A `/`-absolute path (`/reference/orders.md`) points at the *server root*, which differs per consumer (GitHub repo root vs. site root vs. vault root) — so it breaks somewhere every time. This deliberately overrides OKF §5's `/`-absolute **recommendation**; §5 explicitly also *permits* relative links, so relative links remain fully OKF-conformant. See [OKF conformance](okf-conformance.md). |
| **`.md` suffix kept** | GitHub and Obsidian link to the **file**; they need the extension. MkDocs and Docusaurus strip/rewrite `.md` → clean URL at build time, so keeping it is harmless there but mandatory for the first two. (Extensionless links break GitHub and Obsidian.) |
| **URL-encoded** | Paths with spaces or other reserved characters (`task-42%20-%20Bulk%20archive.md`) must be percent-encoded or GitHub and several Markdown parsers will not resolve them. lore encodes when it authors links and warns when it finds raw spaces in a link target. |

lore **enforces** this form on every link it writes itself (`lore new`,
`lore rename`, `lore supersede`, `lore link`, managed task blocks), and the
portability lint **detects** deviations (`/`-absolute, missing `.md`,
unencoded characters) and warns.

**No wikilinks.** `[[Page]]` / `[[Page#Heading|alias]]` is convenient in
Obsidian but renders as literal text on GitHub and is not standard in MkDocs or
Docusaurus. lore neither writes wikilinks nor relies on Obsidian's
"shortest-path-when-possible" resolution — see the next section.

---

## Obsidian-isms lore lints against (warn, detection-only)

Obsidian adds several syntaxes that look like Markdown but render as literal
characters (or not at all) on GitHub and break or no-op in MkDocs/Docusaurus.
lore detects each and emits a **warning** — it does **not** rewrite them.

| Syntax | Example | Why it is not portable |
|---|---|---|
| **Wikilinks** | `[[orders]]`, `[[orders#Policy\|see]]` | Render as literal `[[orders]]` on GitHub; not native to MkDocs/Docusaurus. Use the [required link form](#the-link-form) instead. |
| **Embeds / transclusion** | `![[orders]]`, `![[orders#Policy]]`, `![[diagram.png]]` | Obsidian inlines the target; everywhere else it is literal text or a broken image. Use a normal Markdown link, or a real `![alt](path)` image. |
| **Block reference IDs** | `…some text. ^block-id` and `[[note#^block-id]]` | The `^id` marker renders as literal `^block-id`; the reference link is a dead wikilink elsewhere. Link to a heading anchor instead. |
| **Highlights** | `==important==` | Obsidian-only; renders as literal `==important==` on GitHub and is not enabled by default in MkDocs/Docusaurus. Use bold/italic, or a renderer-specific extension you have explicitly enabled (lore still warns). |
| **Obsidian comments** | `%% hidden note %%` | Hidden in Obsidian but renders as literal `%% … %%` on GitHub and in most builds. Use HTML comments `<!-- … -->`, which hide everywhere. |
| **Callouts** | `> [!note] Title` / `> [!warning]` | Obsidian's callout/admonition syntax. GitHub shows it as a plain blockquote with literal `[!note]`; MkDocs (`!!! note`) and Docusaurus (`:::note`) use *different* syntaxes. There is no single portable callout, so lore warns and leaves it; pick the target's admonition syntax only if you accept it breaks elsewhere. |

These checks are pure pattern detection over the Markdown body (lore skips
[lore-managed regions](consumer-compatibility.md) and code/fenced spans where
the same characters are legitimate). They never fail the build on their own —
they surface as warnings in `lore check`'s portability lint.

---

## MDX safety (for Docusaurus)

Docusaurus parses Markdown as **MDX**, where a raw `<` is interpreted as the
start of a JSX/HTML element and a raw `{` as the start of a JSX expression. Prose
that contains these characters un-escaped — `temperature < 0`, a generic like
`Promise<T>`, or a literal `{ "key": 1 }` in a sentence — makes Docusaurus's MDX
compiler **throw a build error**, even though the exact same source renders fine
on GitHub, in Obsidian, and in MkDocs.

lore's rules for staying MDX-safe:

- **Escape or fence raw `<` and `{`.** In prose, write `&lt;` / `&#123;`, or put
  the content in inline code (`` `Promise<T>` ``) or a fenced code block, where
  MDX does not interpret it. lore's portability lint **detects** un-escaped,
  non-code `<`/`{` and warns; it does **not** auto-escape.
- **Files stay `.md`, never `.mdx`.** Keeping the `.md` extension is what makes
  the same file portable to GitHub/Obsidian/MkDocs. lore therefore never writes
  `.mdx`; instead, [`lore scaffold`](consumer-compatibility.md) configures
  Docusaurus with `markdown.format: 'detect'`, so Docusaurus treats a `.md` file
  as MDX only when it actually contains JSX — minimizing the raw-`<`/`{` blast
  radius for ordinary docs.
- **No underscore-prefixed file names.** Docusaurus treats files and folders
  whose name begins with `_` (e.g. `_partial.md`, `_internal/`) as **partials /
  ignored** and will not build them as pages. lore never generates such names
  and warns if it finds a concept file with a leading underscore.

The trade-offs and exact Docusaurus/MkDocs/Obsidian configuration lore scaffolds
to make these guarantees hold are documented in
[consumer compatibility](consumer-compatibility.md).

---

## Detection, not conversion

To restate the boundary, because it is the most common misunderstanding:

- **lore writes portable Markdown** in everything it authors — portable link
  form, no Obsidian-isms, MDX-safe — so a fresh bundle is portable by
  construction.
- **lore detects non-portable Markdown** you (or an agent) wrote, via the
  portability lint, and **warns**. Warnings are surfaced by `lore check` and in
  the [CLI contract](cli-contract.md); on their own they do **not** fail the
  build (drift and broken internal links do — see
  [OKF conformance](okf-conformance.md)).
- **lore does not auto-convert.** There is no `--fix` for wikilinks, callouts,
  highlights, or raw `<`/`{` today — that converter is **deferred**. The fix is
  a human or agent edit, which keeps the core deterministic and avoids silently
  rewriting authored prose.

lore also does **not** promise pixel-for-pixel parity across renderers even
within the subset — that is the consumers' job. lore guarantees only that the
subset it writes and lints for *renders correctly* (no literal markup, no build
errors) on all four targets. See
[consumer compatibility](consumer-compatibility.md) for the full matrix.

## The portability lint

The portability lint is the mechanism behind everything above. It runs as part
of [`lore check`](cli-contract.md) over the whole bundle and reports:

- non-portable **link form** — `/`-absolute, missing `.md`, unencoded spaces,
  wikilinks/embeds, accidental-colon filenames (`notes:2026.md`, read as a
  `scheme:` URL), trailing-slash directory links (`../reference/`);
- **Obsidian-isms** — `==highlight==`, `%% comment %%`, `^block-id`,
  `> [!callout]`;
- **MDX hazards** — un-escaped raw `<` / `{` in prose, raw HTML tags,
  `_`-prefixed file names, `.mdx` files.

Every finding is a **warning** (output mode follows the global
`--json` / `--plain` / pretty precedence; warnings go to stderr, data to
stdout). The lint is **detection-only by design**: it makes non-portable syntax
visible and reviewable without ever mutating authored content. Link to
[consumer compatibility](consumer-compatibility.md) for what each renderer
actually does with the syntax the lint flags.
