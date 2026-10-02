# Vendored: the Lore pane's editing model

LCLI-664. The pane's inline body editor needs a document, selection and undo model, and a
Claude Code hooks module can import **only its own files by relative path and `claude-code`**
(the engine's validator: *"a hooks module imports its own files by relative path and
\"claude-code\", nothing else"*), with **no Node and no DOM** — both measured 2026-10-02 on
Claude Code 2.1.287, recorded in
[ADR-0026](../../docs/adr/0026-the-lore-pane-s-body-editing-ships-a-lightweight-inline-editor-and-a-desktop-editor-action-dec-132.md).
So a library cannot be installed; it is vendored here as source and imported relatively.

**These two files are the whole dependency graph** of `@codemirror/state`: its ESM build's
only bare import is the second file.

| File in this directory | Package | Version | License | sha256 |
| --- | --- | --- | --- | --- |
| `codemirror-state.js` | `@codemirror/state` | 6.7.6 | MIT (`LICENSE-codemirror-state.txt`) | `b53f81cb981b52db944d6e2d21b32225b04b251116297ef35ecb1d8b6b27874c` |
| `find-cluster-break.js` | `@marijn/find-cluster-break` | 1.0.4 | MIT (`LICENSE-find-cluster-break.txt`) | `4e9e441fac9db54e09e4e3b1cb0b0393da207ebe943f2ff9efc577821fc03751` |

Both licenses are MIT and permit redistribution in this package; each license text ships beside
its file, as above.

## The one patch, and how to re-vendor

`find-cluster-break.js` is **unmodified** — the digest above is the digest of
`@marijn/find-cluster-break@1.0.4`'s own `src/index.js`.

`codemirror-state.js` is `@codemirror/state@6.7.6`'s `dist/index.js` with **one line changed**:
its first line's import specifier, which the engine would refuse as a bare specifier.

- Upstream `dist/index.js` sha256: `cf4ffe7d177bf2c7c5da66c49be0811cc79a29e12cb658238876bbdcef12939c`
- Vendored here, sha256: `b53f81cb981b52db944d6e2d21b32225b04b251116297ef35ecb1d8b6b27874c`
- The patch, exactly:

  ```diff
  -import { findClusterBreak as findClusterBreak$1 } from '@marijn/find-cluster-break';
  +import { findClusterBreak as findClusterBreak$1 } from './find-cluster-break.js';
  ```

To re-vendor: take the two files from the packed tarballs (`npm pack @codemirror/state`,
`npm pack @marijn/find-cluster-break`), apply that one substitution, recompute both digests,
and update this table. Nothing else in either file is edited, and no algorithm in them is
this repository's — which is the point of the exercise: the document, transaction, line-index
and grapheme-cluster behaviour is CodeMirror's, and the pane writes none of it.
