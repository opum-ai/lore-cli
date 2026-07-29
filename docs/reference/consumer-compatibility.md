---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: Consumer compatibility
description: How one unmodified OKF docs/ bundle serves GitHub, Obsidian, MkDocs/Material, Docusaurus, and Confluence.
tags: [consumers, portability, links, obsidian, mkdocs, docusaurus, confluence]
summary: One OKF bundle renders across GitHub, Obsidian, MkDocs, Docusaurus, and Confluence with one link convention and two scaffolded config flips.
timestamp: 2026-06-21T00:00:00Z
---

# Consumer compatibility

lore produces exactly **one** OKF bundle under `docs/`. The same files —
unmodified, with or without lore installed — are meant to render and navigate
across five consumers:

| Consumer | Role | lore involvement |
|---|---|---|
| **GitHub** | Default browse/diff/review surface | none — relative `.md` links just work |
| **Obsidian** | Local editing + the *only* graph/backlinks view | recommended vault settings; optional committed `app.json` preset |
| **MkDocs + Material** | Polished, searchable, browsable web site | `lore scaffold mkdocs` (config outside `docs/`) |
| **Docusaurus** | Richer React docs site | `lore scaffold docusaurus` (config outside `docs/`) |
| **Confluence** | One-way *publish* target (deferred) | publish-time rewrite, no on-disk constraint |

This all hinges on **one load-bearing decision** and **two consumer-side config
flips**. No bundle file ever needs to fork per consumer.

- **The decision:** every cross-link lore emits is **relative, URL-encoded,
  `.md`-suffixed, with no leading slash** (`[orders](../reference/orders.md)`).
  This is the only link form that satisfies all of GitHub render, Obsidian
  graph+backlinks, MkDocs nav, and Docusaurus nav simultaneously. See
  [portable-markdown.md](./portable-markdown.md) for the full lint rules and
  [ADR-0009](../adr/0010-multi-consumer-docs-layer.md) for the decision record.
- **Flip 1 (Docusaurus):** `markdown.format: 'detect'` — without it, raw `<` /
  `{` in hand-written prose breaks the MDX build.
- **Flip 2 (MkDocs):** `validation.links.absolute_links: relative_to_docs`
  (MkDocs >= 1.6) — a safety net for any `/`-absolute link that survives.

Both flips live in scaffolded config files **outside** `docs/`, so the bundle
stays a valid, tool-neutral OKF bundle. See
[okf-conformance.md](./okf-conformance.md) for how this stays within OKF tolerance
rules.

---

## 1. Compatibility matrix

Legend: ✓ works · ⚠ works with caveat/config · ✗ not supported.

| Capability | GitHub | Obsidian | MkDocs/Material | Docusaurus | Confluence |
|---|---|---|---|---|---|
| **Link resolution** | ✓ relative `.md` | ⚠ relative `.md`, **must be URL-encoded, NO leading slash** (`/`-absolute = broken, no edge) | ⚠ relative native; `/`-absolute needs `absolute_links: relative_to_docs` (>=1.6) | ⚠ relative & `/`-absolute resolve **only with `.md` ext**; needs `format:'detect'` | ✓ rewritten at publish; unresolved → plain text + warning |
| **Graph / backlinks** | ✗ | ✓ **only consumer** — from BODY links only (`specs:`/`tasks:` frontmatter = no edge without a plugin) | ✗ native (3rd-party plugins want wikilinks → out of scope) | ✗ native | ✗ (labels/props only) |
| **Frontmatter / tags** | ✓ YAML table | ✓ Properties; `tags` special (graph filter); unknown keys tolerated | ✓ `page.meta`; `title`/`description`/`tags` consumed; needs `tags.md` index | ✓ Joi allows unknown; `title`/`description`/`tags`/`slug`/`sidebar_position` consumed | ✓ `type`/`tags`/`status` → labels/props |
| **index / nav** | ✓ index.md = normal file | ⚠ index.md is an ordinary note (no core folder-note); **lore fills index.md with body links so it acts as a hub** | ✓ `navigation.indexes` → index.md = section landing; autogen tree; `log.md` via `not_in_nav` | ✓ autogen sidebar; index.md = category index; `log.md` needs `sidebar_label`/exclude | ✓ dir tree → page ancestry; index.md → parents |
| **Broken-link tolerance** | ✓ tolerant | ⚠ tolerant but silent (unresolved → no edge) | ⚠ tolerant after `not_found: warn`, `nav.omitted_files: ignore`, `strict:false` | ✗→⚠ **default `onBrokenLinks:'throw'` fails prod build**; set `'warn'` + `markdown.hooks.onBrokenMarkdownLinks:'warn'` | ✓ never emits broken-link macro |
| **MDX / raw-md safety** | ✓ literal `<`/`{` | ✓ literal | ✓ literal (CommonMark) | ✗→✓ default MDX **breaks on `<`/`{`**; fixed by `format:'detect'` (experimental) | ✓ renderer is lore-controlled |

Net: **Obsidian sets the link-form constraint; Docusaurus sets the MDX-safety and
broken-link constraints; MkDocs is forgiving with one knob; GitHub and Confluence
impose nothing new.**

---

## 2. The cross-tool link convention

> **lore emits and normalizes every cross-link as RELATIVE, URL-encoded,
> `.md`-suffixed, with NO leading slash, and NO wikilinks.**

From `docs/stories/bulk-archive-orders.md`, a link to the orders reference is
`[orders](../reference/orders.md)` — never `/reference/orders.md`, never
`[[orders]]`, never extensionless. Relative depth must be exact and every
destination must be URL-encoded (spaces → `%20`).

Why each consumer needs *exactly* this form:

| Consumer | Why this form |
|---|---|
| **GitHub** | Renders and navigates relative `.md` links directly in the repo browser and PR diffs. |
| **Obsidian** | This is the **only** form that produces full graph edges *and* backlinks. `/`-leading-slash is silently treated as external (no edge); un-encoded spaces silently fail to resolve; wikilinks would break GitHub. |
| **MkDocs** | Treats relative `.md` as first-class and always rewrites it to the output HTML path. |
| **Docusaurus** | Resolves the link against the current file's directory; the `.md` extension is the trigger that makes Docusaurus treat it as a file reference (extensionless → 404). |
| **Confluence** | Rewrites links at publish against `sync-state.json` regardless of on-disk form, so it imposes no constraint — but reuses the same resolver. |

**Rejected forms.** `/`-absolute (OKF §5's *recommendation*) breaks the Obsidian
graph and needs a MkDocs rewrite knob. Wikilinks `[[…]]` are first-class in
Obsidian but render as literal text on GitHub and are unsupported by Docusaurus.

**OKF reconciliation.** OKF §5 *recommends* `/`-absolute but **also explicitly
allows relative links**, so choosing relative is fully OKF-conformant. lore
overrides a recommendation, not the spec — recorded in
[ADR-0009](../adr/0010-multi-consumer-docs-layer.md). Full lint severities and the
managed-block escape case are in
[portable-markdown.md](./portable-markdown.md).

---

## 3. Per-tool setup

lore never mutates the bundle to satisfy a consumer. The browsable consumers get
**additive config files scaffolded outside `docs/`** via `lore scaffold`; see
[cli-surface.md](./cli-surface.md) for the command surface. Scaffolded configs
are user-owned — lore writes them once and does not re-overwrite.

### 3.1 GitHub

No setup. Relative `.md` links, YAML frontmatter tables, and literal `<`/`{` all
render in the GitHub repo browser and PR diffs out of the box. This is the
baseline lore targets first.

### 3.2 Obsidian

Obsidian is the only consumer that gives a graph view and backlinks, computed
**from body links** (frontmatter arrays like `specs:`/`tasks:` do not create
edges without a community plugin).

Recommended manual setup:

1. Open `docs/` directly as the vault (not the repo root), so only the OKF
   bundle is indexed and `.lore/` JSON/TOML stays hidden.
2. Settings → **Files & Links**:
   - **New link format** = *Relative path to file*
   - **Use `[[Wikilinks]]`** = **OFF**
   - **Automatically update internal links** = ON

   This guarantees any link a human authors inside Obsidian comes out
   GitHub-compatible.

`lore scaffold obsidian` (optional) writes:

- `docs/.obsidian/app.json` with `useMarkdownLinks: true`, `newLinkFormat:
  "relative"`, `alwaysUpdateLinks: true` (committed, shared preset).
- A `.gitignore` entry for `docs/.obsidian/workspace*.json` and the cache (commit
  `app.json` only).

The real guarantee is that **lore generates correct links**; the `app.json` keys
are Obsidian-version-internal and best-effort. Graph filtering uses `tags`; the
story-convention `type` is invisible to the graph unless projected into a tag
(opt-in, off by default). The "Folder Note" and "Frontmatter Markdown Links"
community plugins are documented options, never dependencies.

### 3.3 MkDocs + Material

`lore scaffold mkdocs` writes a repo-root `mkdocs.yml` (sibling to `docs/`),
pins `mkdocs >= 1.6` and `mkdocs-material >= 9.x`, and adds a `docs/tags.md`
index page (given a valid `type:` so it stays OKF-legal). Key settings:

```yaml
docs_dir: docs
theme:
  name: material
  features:
    - navigation.indexes        # index.md becomes each section's landing page
plugins:
  - search
  - tags                        # frontmatter `tags` → chips + tag index
strict: false
validation:
  links:
    absolute_links: relative_to_docs   # MkDocs >= 1.6: resolve any /-absolute survivor
    not_found: warn
    anchors: warn
  nav:
    omitted_files: ignore
    not_found: warn
not_in_nav: |
  /log.md
```

Nav is autogenerated (no enumerated `nav:`). `absolute_links: relative_to_docs`
is the safety net for `/`-absolute links; `not_found: warn` plus `strict: false`
honor OKF's broken-link tolerance and keep cross-tree `backlog/` links (§4) from
failing the build.

### 3.4 Docusaurus

`lore scaffold docusaurus` writes a `website/` directory beside `docs/` with a
`docusaurus.config.js` whose docs `path` points at `../docs` (it does **not**
copy or mutate the bundle). The single most important line is
`markdown.format: 'detect'`.

Unlike MkDocs (a standalone, pip-installed tool), Docusaurus's CLI is a
project-local devDependency that resolves its preset/theme from the site's own
`node_modules` — so `website/` also gets its own `package.json`, pinning
`@docusaurus/core` and `@docusaurus/preset-classic` to the same exact version
(Docusaurus packages must stay in lockstep):

```json
// website/package.json (scaffolded; user-owned)
{
  "name": "website",
  "private": true,
  "scripts": { "build": "docusaurus build" },
  "dependencies": {
    "@docusaurus/core": "3.10.2",
    "@docusaurus/preset-classic": "3.10.2",
    "react": "19.2.7",
    "react-dom": "19.2.7"
  }
}
```

```js
// docusaurus.config.js (scaffolded; user-owned)
//
// CommonJS, not ESM: an `export default` form here crashes the production
// build (`TypeError: require.resolveWeak is not a function`, an ESM/webpack-SSR
// interaction) — verified against a real `docusaurus build`. Do not add
// "type": "module" to website/package.json.
module.exports = {
  markdown: {
    format: 'detect',              // .md → CommonMark; raw <, { become literal
    hooks: { onBrokenMarkdownLinks: 'warn' },  // moved here in v3.9
  },
  onBrokenLinks: 'warn',           // default is 'throw' — would fail prod build
  onBrokenAnchors: 'warn',
  trailingSlash: false,            // pin to avoid relative-link drift
  presets: [['classic', {
    docs: {
      path: '../docs',
      routeBasePath: '/',
      sidebarPath: './sidebars.js',
    },
    blog: false,                   // avoid parent-folder MDX-loader conflicts
  }]],
};
```

```js
// sidebars.js (scaffolded; user-owned) — fully autogenerated from the bundle tree
module.exports = { docs: [{ type: 'autogenerated', dirName: '.' }] };
```

Without `format: 'detect'`, Docusaurus parses `.md` as MDX and treats raw `<`
(e.g. `<id>`, `a < b`) as JSX and `{` as a JS expression, breaking the build —
near-guaranteed for hand-written OKF prose and the `<!-- lore:tasks:begin -->`
comments. `onBrokenLinks: 'warn'` overrides the default `'throw'` so the
production build honors OKF's broken-link tolerance. Avoid `_`-prefixed
files/folders — Docusaurus excludes them by default.

### 3.5 Confluence (deferred)

Confluence is **not** "the same files served live." It is a one-way **publish**
target (implementation deferred). At publish time the adapter rewrites
bundle-relative links against `.lore/sync-state.json` to Confluence page links;
unresolved targets render as plain text plus a tracked warning, never a broken
macro. Because rewriting happens at publish, Confluence imposes **no** on-disk
link constraint — the same resolver from `links.ts` is reused. Details and the
provenance-banner design are in the lore design spec
([../specs/lore-design.md](../specs/lore-design.md)).

---

## 4. Known limitations

These are degradations and a division of labor, not breakage:

1. **Graph and backlinks are Obsidian-only.** GitHub, MkDocs, Docusaurus, and
   Confluence render no graph and compute no backlinks from any link form.
   Third-party MkDocs graph plugins want wikilinks, which the bundle deliberately
   avoids. This is a layered design: MkDocs/Docusaurus are the polished web layer;
   Obsidian is the local graph/edit layer; GitHub is the review layer.

2. **`backlog/` cross-links escape the web root.** The managed task block links
   into `../../backlog/tasks/task-42%20-%20…md`. These resolve on GitHub and
   Obsidian but sit *outside* `docs_dir` / the Docusaurus content root, so MkDocs
   and Docusaurus report them broken. lore keeps them relative + URL-encoded for
   GitHub/Obsidian; the rendered-web sites tolerate them via `warn` (or,
   optionally, absolute GitHub blob URLs). See
   [backlog-cli-contract.md](./backlog-cli-contract.md) for the task-file naming
   that drives the `%20` encoding, and [portable-markdown.md](./portable-markdown.md)
   for how the portability lint scopes this case.

3. **Docusaurus CommonMark mode is experimental.** `markdown.format: 'detect'`
   is officially experimental and disables JSX/import-export. This is acceptable —
   OKF bundles must avoid tool-specific MDX anyway — but it is not a frozen API.
   The `scaffold-docusaurus` CI job smoke-tests it with a real `docusaurus build`
   against the live bundle on every push/PR (LCLI-40), not just before release.

4. **lore does not guarantee cross-renderer parity.** lore *detects*
   non-portable syntax (the portability lint warns) and generates portable links,
   but exact rendering of edge cases (admonitions, footnotes, complex tables) is
   the consumer's job, not lore's.

---

## See also

- [portable-markdown.md](./portable-markdown.md) — the link convention and full lint rules
- [okf-conformance.md](./okf-conformance.md) — OKF tolerance and §5 reconciliation
- [cli-surface.md](./cli-surface.md) — `lore scaffold` and other commands
- [backlog-cli-contract.md](./backlog-cli-contract.md) — task-file naming behind `backlog/` links
- [ADR-0009](../adr/0010-multi-consumer-docs-layer.md) — portable cross-link decision
