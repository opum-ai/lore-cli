---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: Tech Stack
description: The libraries, runtime, and distribution model behind lore — with pinned versions, rationale, and the dependencies deliberately left out.
tags: [tech-stack, dependencies, runtime, distribution, build]
summary: lore runs on a pinned Bun + TypeScript stack (hand-rolled CLI parsing, gray-matter, mdast-util-from-markdown, Zod v4, native TOML) and ships with no vector DB, no Rust binary, no TOML lib, and no LLM.
timestamp: 2026-06-21T00:00:00Z
---

# Tech Stack

This document is the authoritative inventory of lore's dependencies: what we use,
why, at what version, and — just as importantly — what we deliberately refuse to
depend on. It expands [the spec's §4 tech-stack table](../specs/lore-design.md)
and is the reference companion to
[architecture.md](architecture.md) (how the pieces fit) and
[the runtime/build/distribution ADR](../adr/0001-runtime-build-distribution.md).

Guiding constraints, in priority order:

1. **Thin.** Every dependency must earn its place. We do not reimplement
   Backlog.md, Confluence, or the consumer renderers (MkDocs / Docusaurus /
   Obsidian).
2. **Deterministic core.** The `core/` layer has **no LLM dependency** and no
   network dependency. The same inputs always produce byte-identical outputs so
   agent loops and CI stay clean.
3. **Match Backlog.md.** Where a choice is otherwise a wash, we pick what
   Backlog.md uses (Bun, TypeScript) for a shared mental model and a parallel
   distribution story.
4. **Zero-config.** Defaults work in a fresh repo. No required config file, no
   required services.

---

## 1. Runtime — Bun (pinned)

| | |
|---|---|
| **Package** | [Bun](https://bun.sh) |
| **Pinned version** | declared in `package.json` `engines.bun` **and** in a repo-root `.bun-version` / `bunfig.toml`; CI installs that exact toolchain |
| **Role** | JS/TS runtime, package manager, test runner, and — critically — the single-file compiler (`bun build --compile`) |

**Rationale.** Backlog.md is a Bun project; matching it gives us a shared mental
model and the same single-binary distribution path. Bun's fast cold start
matters because lore is invoked per-command by agents and CI, not kept resident.
Bun also gives us, in one toolchain and with **no extra dependency**, several
things we would otherwise pull libraries for:

- **`Bun.spawn` / `Bun.spawnSync`** — the subprocess primitive the Backlog.md
  adapter uses to shell out to the `backlog` binary. See
  [backlog-cli-contract.md](backlog-cli-contract.md).
- **Native TOML import** — Bun parses `.toml` natively (`import cfg from
  "./config.toml"`), so reading `.lore/config.toml` needs **no TOML library**
  (see §10).
- **`Bun.file` / fast FS** — bundle walking and reads.
- **`bun test`** — the test runner; no separate Jest/Vitest dependency.

**Why pin.** `bun build --compile` embeds a specific Bun runtime into the
produced binary, and the `--json` contract and managed-block surgery must behave
identically across every developer, CI runner, and shipped artifact. An unpinned
runtime is an undeclared dependency. The pin is enforced in CI before any build.

**Compile targets.** We build with `bun build --compile --target=…` using the
**baseline** x64 variants (e.g. `bun-linux-x64-baseline`,
`bun-windows-x64-baseline`) so the binaries run on older/virtualized CPUs that
lack newer SIMD extensions, plus the arm64 targets (macOS/Linux). Details and the
full target matrix live in
[ADR 0001](../adr/0001-runtime-build-distribution.md).

**Compile-time caveat: `--outfile` must land on the same filesystem as the
source tree (LORE-14).** `bun build --compile` writes the binary via a
temp-file-then-rename step; when the temp file and the final `--outfile` path
sit on **different mounted filesystems** (e.g. compiling a checkout on one
volume to an `--outfile` on another), the rename hits `EXDEV`
(cross-device link) and Bun has been observed to swallow that failure —
producing a **0-byte binary with exit code `0`** and no error output at all,
on either stream. This is silent and easy to miss: `--version`/`--help`
against the broken binary also exit `0` with empty stdout, so an exit-code-only
smoke check would pass on a completely non-functional artifact. Verified by
reproduction: compiling this repo's checkout with `--outfile` on the same
volume produces a working, correctly-sized binary every time; targeting a
different mounted volume reproduces the empty-file failure reliably. **Fix:**
always compile to an `--outfile` on the same filesystem as the checkout (a
subdirectory of the repo, or the CI runner's single default filesystem — both
of which the `compile smoke` CI job already does, which is why it doesn't hit
this), and assert the produced binary is non-empty **and** actually runs
(`--version` prints something, not just exit `0`) rather than trusting the
exit code alone — exactly the two checks the `compile smoke` job in `ci.yml`
already makes. [`DEVELOPMENT.md`](../../DEVELOPMENT.md#local-environment-working-copies-on-an-external-volume)
already documented this failure mode from the "cloned onto an external volume"
angle; LORE-14 confirmed the precise trigger is **crossing any filesystem
boundary** (not that volume specifically) and tightened both notes to match.

**Native-module surface.** None of lore's v1 runtime dependencies
(`gray-matter`, `js-yaml`, `mdast-util-from-markdown`, `zod`) ship a native
addon (no `.node` binaries, no `binding.gyp`) — all pure JS/TS. A same-filesystem
`bun build --compile` bundles and runs all four with no special handling; the
"native modules stay optional and lazily required" policy in
[ADR-0001](../adr/0001-runtime-build-distribution.md) is a forward-looking
guard for a *future* native dependency, not a caveat any current one triggers.

---

## 2. Language — TypeScript

| | |
|---|---|
| **Package** | `typescript` |
| **Role** | All of `src/`; types are the contract surface |
| **Notes** | Run directly by Bun (no separate `tsc` transpile step needed at runtime); `tsc --noEmit` is used in CI for type-checking only |

**Rationale.** Same language as Backlog.md. More importantly, lore's value is in
*contracts* — the [Backlog.md `--json` envelope](backlog-json-schema.md), the
[lore `--json` output envelope](cli-contract.md), the per-type frontmatter
schemas — and TypeScript lets those contracts be expressed as types that are
mechanically checked. Bun executes `.ts` directly, so TypeScript is a
build-/dev-time concern, not a runtime one.

---

## 3. CLI framework — a hand-rolled router (Commander deferred)

| | |
|---|---|
| **Package** | *(none — hand-rolled in `src/cli.ts`)* |
| **Role** | Argument parsing, subcommand dispatch, help text, the entrypoint in `src/cli.ts` |

**Rationale.** Backlog.md uses Commander, and it remains the **named eventual
entrypoint** for lore too (see `src/cli.ts`'s own module docstring) — but
adopting it is **deferred until the command count justifies the dependency**.
While the command surface stays small, a hand-rolled parser keeps the package
dependency-neutral with respect to the isolated-linker / EXDEV packaging
constraints ([ADR-0001](../adr/0001-runtime-build-distribution.md)), at the
cost of a bit more hand-written flag-splitting code per command (mitigated by
the shared tokenizer in `commands/args.ts` most commands reuse). Every command
still gets the subcommand structure (`lore new`, `lore validate`, `lore
check`, …) documented in [cli-surface.md](cli-surface.md), and one stable
seam — `src/cli.ts`'s router — enforces the cross-cutting output flags:

- **Output-mode precedence** `--json > --plain > pretty`, with `--plain` forced
  automatically when stdout is non-TTY. Defined in [cli-contract.md](cli-contract.md).
- **Semantic exit codes** (`0` ok, `2` usage, `3` not-found, `4` denied,
  `5` conflict/exists, `6` validation-or-drift), mapped centrally in `errors.ts`
  so no command hand-rolls its own `process.exit`.
- **`NO_COLOR`** honoring and TTY detection for color.

---

## 4. Frontmatter — gray-matter

| | |
|---|---|
| **Package** | `gray-matter` |
| **Role** | Parse and serialize the YAML frontmatter block at the top of every concept `.md` |

**Rationale.** Battle-tested, round-trips YAML frontmatter cleanly, and is the de
facto choice in the markdown-tooling ecosystem. lore parses with gray-matter,
validates the parsed object against a Zod schema (§7), and serializes back when
writing. gray-matter handles the `---` fence detection and the body split; Zod
handles meaning and shape.

**Quote-safety note.** gray-matter parses whatever YAML it is given. lore's
[`validate`](cli-surface.md) adds a frontmatter **quote-safety** check on top
(catching values that YAML would silently coerce or that break on re-serialize)
because "parses today" is not the same as "round-trips losslessly." See
[okf-conformance.md](okf-conformance.md).

---

## 5. Markdown AST — mdast-util-from-markdown (parse-only)

| | |
|---|---|
| **Packages** | `mdast-util-from-markdown` and the `@types/mdast` types |
| **Role** | A real markdown AST for **locating** managed blocks and links; writes are string-splice, never AST re-serialization |

**Rationale.** Several lore operations are *surgical edits to existing prose* and
must not disturb the author's content. A real AST — not regex over text — is what
makes *locating* the right span safe and idempotent:

- **Managed blocks.** The `<!-- lore:tasks:begin -->` / `:end` region inside a
  Story is regenerated from live Backlog.md data. AST-level location of the HTML
  comment pair guarantees we replace exactly that region and that unchanged input
  yields byte-identical output (clean diffs, safe agent loops).
- **Link discovery for the graph.** [`lore graph`](cli-surface.md) and
  [`lore context`](cli-surface.md) walk link nodes to build the cross-link graph.
- **Link rewriting.** [`lore rename`](cli-surface.md) and `lore supersede` rewrite
  every inbound link across the bundle; [`lore replace`](cli-surface.md) does
  find/replace while **skipping lore-managed regions** — both need to operate on
  link/text nodes, not raw bytes.

**Parse-only, deliberately.** lore ships **only** the parser
(`mdast-util-from-markdown`) — not the full `unified`/`remark` pipeline and not
`remark-stringify`/`mdast-util-to-markdown`. Every write is **parse-to-locate,
then string-splice** the original bytes at the located offsets, never
"re-serialize the whole AST." This is a load-bearing choice, not an oversight:
a stringify round-trip risks reflowing or reformatting the author's untouched
prose (width-wrapping, list-marker normalization, escaping differences), which
would break the "unchanged input → byte-identical output" guarantee managed
blocks and link rewrites depend on. See
[ADR-0008](../adr/0008-managed-block-remark-ast.md) (the LORE-22 amendment
records this shift from an originally-planned `unified().use(remarkParse)`
pipeline to the leaner parser-only shape) and
[ADR-0011](../adr/0011-frontmatter-serialization-stability.md) for the
frontmatter side of the same byte-stability discipline.

The link conventions these tools produce and preserve are specified in
[portable-markdown.md](portable-markdown.md): relative, URL-encoded, `.md`-suffixed,
no leading slash.

---

## 6. Internal link & anchor validation — hand-rolled over the parsed mdast

| | |
|---|---|
| **Package** | *(none — no `remark-validate-links` dependency)* |
| **Role** | Validate internal cross-links and heading-anchor targets across the whole bundle for [`lore check`](cli-surface.md) |

**Rationale.** [`lore check`](cli-surface.md) must verify that every internal
link resolves and every `#anchor` matches a real heading, across the whole bundle
in one pass. lore does this in **pure JavaScript**, hand-rolled directly over
the mdast §5 already parses — `core/bundle.ts`'s `walkMdast`/`extractLinkTargets`
locate every link/heading node, and `core/check.ts` cross-references them
against the loaded bundle graph — rather than depending on the
`remark-validate-links` plugin (which would pull in the full `unified`/`remark`
pipeline §5 deliberately does not ship). No external binary, no network,
internal-by-default. External liveness checking is **opt-in** via `--external`
and is the only mode that touches the network.

This is a deliberate choice over a Rust link checker (e.g. **lychee**): see §10
and [validation & coherence (ADR-0007)](../adr/0007-validation-and-coherence.md).
Doing it hand-rolled, in-process, over an AST we already build avoids both a
Rust toolchain/native binary *and* an extra remark-ecosystem dependency.

---

## 7. Validation & schema — Zod (v4)

| | |
|---|---|
| **Package** | `zod` (**v4**) |
| **Role** | The **single source of truth** for every frontmatter schema, and the generator for the JSON Schemas used for editor autocomplete |

**Rationale.** lore has exactly one place where frontmatter shape is defined:
Zod schemas, one per `type`. Everything else is derived from them.

- **Strict for known types, lenient for unknown.** Known types
  (`Reference`/`Spec`/`ADR`/`Runbook`/`Epic`/`Story`) get strict per-type schemas
  with required fields and sections. Unknown types get a lenient `type`-only
  schema — this is OKF's tolerance rule (consumers must tolerate unknown
  types/keys), and lore honors it by passing user-defined types and custom
  frontmatter through untouched (warn, never error). The full tiering is in
  [okf-conformance.md](okf-conformance.md).
- **JSON Schema generation.** Zod v4 ships **`z.toJSONSchema()`**, which emits a
  Draft-7 JSON Schema directly from each schema (no `zod-to-json-schema` third-party
  dependency required, unlike Zod v3). lore writes those schemas under
  `.lore/schemas/` and injects a
  `# yaml-language-server: $schema=…` modeline at the top of scaffolded concept
  files so editors (VS Code + the YAML extension, etc.) give frontmatter
  autocomplete and inline validation. See §11.
- **Dates as ISO strings.** `timestamp` and any date field are ISO-8601 strings,
  validated as such — not `Date` objects — so they serialize deterministically.

Why v4 specifically: native `z.toJSONSchema()` removes a dependency and keeps the
schema and the emitted JSON Schema guaranteed in lockstep (one source, one
generator). The schema-to-output story is detailed in
[cli-contract.md](cli-contract.md).

---

## 8. Config format — TOML via Bun (no library)

| | |
|---|---|
| **Format** | TOML (`.lore/config.toml`) |
| **Parser** | **Bun's native TOML import** — `import config from "./config.toml"` |
| **Library** | **none** |

**Rationale.** lore reads a small config file (`.lore/config.toml`) and Bun parses
TOML natively at import time. That means **zero** added dependency for config
parsing — see §10. TOML is human-friendly, comment-friendly, and matches the
ecosystem's expectation for tool config. Secrets (e.g. the deferred Confluence
token) are read from environment variables, never the file.

---

## 9. MCP SDK — @modelcontextprotocol/sdk (DEFERRED)

| | |
|---|---|
| **Package** | `@modelcontextprotocol/sdk` |
| **Status** | **Deferred to v2.** Not shipped in v1. |
| **Role (when built)** | A stdio MCP transport exposing the *same* `core/` functions the CLI calls |

**Rationale.** The **CLI is primary** for both humans and Claude Code. The MCP
server is a secondary, deferred *transport* over the identical core functions —
it adds no new behavior, only a different call path. Because it is deferred, the
SDK is **not a v1 runtime dependency**; it enters the dependency set only when the
M6 milestone is built. The intended tool/resource surface is documented now (so
the core API is designed transport-agnostic) in
[mcp-tools.md](mcp-tools.md). Until then, the agent bridge is the generated
`.claude/skills/lore/SKILL.md`, a small CLAUDE.md nudge, and `lore instructions`
— no SDK required. See [agent-onboarding.md](../runbooks/agent-onboarding.md).

---

## 10. Deliberately NOT dependencies

These omissions are design decisions, not gaps. Each removes weight, attack
surface, or a determinism/portability hazard.

| Not used | What we'd "gain" | Why we refuse it |
|---|---|---|
| **Vector DB / embeddings / RAG / chunker** (e.g. a local vector store) | semantic retrieval | [`lore query`](cli-surface.md) is in-memory **BM25-style full-text + frontmatter filters**; [`lore context`](cli-surface.md) is **deterministic, depth-bounded graph expansion**. No vectors means no index to build, no model to load, reproducible results, and a deterministic core. |
| **Rust link checker at runtime** (e.g. **lychee**) | fast external link checks | We use a pure-JS, hand-rolled validator (§6) on the AST we already have — no `remark-validate-links` dependency either. No Rust toolchain, no native binary to ship per platform, no subprocess. External liveness stays opt-in (`--external`). See [ADR-0007](../adr/0007-validation-and-coherence.md). |
| **A TOML parsing library** (`@iarna/toml`, `smol-toml`, etc.) | TOML parsing | Bun parses TOML natively (§8). Adding a library would duplicate a runtime capability. |
| **An LLM / model SDK in `core/`** | "smart" summaries, ranking, link suggestions | The **core is deterministic by mandate**. No network, no model, no nondeterminism. The `summary` field is author-written; the chars/4 token figure is an explicitly *labeled estimate*, not a model call. Any future LLM use lives outside `core/` and is never on the validate/check/sync path. |
| **A separate test runner / bundler / transpiler** (Jest, Vitest, esbuild, webpack, tsup) | tests, build | Bun provides `bun test` and `bun build --compile`. `tsc` is used for type-checking only. |
| **A YAML library beyond gray-matter's** | extra YAML control | gray-matter (§4) already owns frontmatter YAML; quote-safety is a lore-level lint, not a new parser. |
| **A Confluence SDK** | publish to Confluence | The (deferred) Confluence adapter uses plain `fetch` against the REST API in an isolated module with **zero core dependency**. |
| **An interactive prompt library** (inquirer, prompts) | nice wizards | Every command is **non-interactive by default** (agent/CI-safe). Scaffolding uses `--template` + `--var k=v`, not prompts. |

---

## 11. Editor experience — JSON Schema + yaml-language-server modeline

This is not a runtime dependency; it is how authoring feels in an editor, and it
falls out of the Zod-as-source-of-truth decision (§7) for free.

1. Each Zod per-type schema is exported to a Draft-7 JSON Schema via
   `z.toJSONSchema()` and written under `.lore/schemas/<type>.schema.json`.
2. `lore new` (and the templates under `.lore/templates/<type>.md`) inject a
   modeline as the file's first line:

   ```
   # yaml-language-server: $schema=../../.lore/schemas/story.schema.json
   ```

3. The [YAML Language Server](https://github.com/redhat-developer/yaml-language-server)
   (bundled with the VS Code YAML extension and available in other editors) reads
   that modeline and provides **frontmatter autocomplete, hover docs, and inline
   validation** against the exact same schema lore validates with on the CLI.

The result: the editor and `lore validate` agree by construction, because both
derive from the one Zod definition. Producer-defined types and custom keys still
pass through (OKF tolerance), so the modeline aids known types without
constraining authors.

---

## 12. Distribution

lore ships as a **dual-artifact** npm package; the mechanism and rationale are
specified in [ADR 0001](../adr/0001-runtime-build-distribution.md) and summarized
here.

| | |
|---|---|
| **npm package** | `@salient-data/lore` |
| **`bin`** | `lore` |
| **License** | MIT — Jeremy Newhouse, 2026 |
| **Repo** | `github.com/jeremy-newhouse/lore` (private; branches `main` + `dev`, `dev` default) |

**Build.** `bun build --compile` produces a self-contained native binary per
platform (baseline x64 + arm64 targets — see §1).

**Dual-artifact npm layout.**

- A small **Node `.cjs` launcher** is the package's `bin` entry. It runs under
  plain Node (so `npx @salient-data/lore` works without Bun installed) and
  execs the correct platform binary.
- **Per-platform binaries** are published as **`optionalDependencies`**. npm
  installs only the one matching the host's OS/arch; the launcher locates and
  execs it.

This mirrors Backlog.md's own distribution shape and lets the same codebase be
consumed three ways: `npx`/`bunx` for ad-hoc use, an installed `lore` binary for
day-to-day, and a pinned binary release for CI.

**The fork dependency.** lore requires a `--json`-capable Backlog.md, which stock
v1.47.1 lacks. We consume our fork (`jeremy-newhouse/Backlog.md`) as a
**locally-compiled git dependency** during development and enforce a minimum
version via the [capability probe](backlog-cli-contract.md). The fork work and
upstream PR are described in
[backlog-json-patch.md](../runbooks/backlog-json-patch.md) and
[ADR 0002 on the Backlog.md integration](../adr/0002-backlog-integration-json-only.md).

---

## 13. Dependency summary

| Concern | Dependency | Version pin | v1? |
|---|---|---|---|
| Runtime / build / spawn / TOML / test | Bun | **pinned** (`.bun-version`) | yes |
| Language | TypeScript | dev-/typecheck-only | yes |
| CLI parsing | *(hand-rolled; Commander deferred — §3)* | — | yes |
| Frontmatter parse/serialize | gray-matter | `^` | yes |
| Markdown AST surgery & links | mdast-util-from-markdown (mdast), parse-only | `^` | yes |
| Internal link & anchor validation | *(hand-rolled over the parsed mdast — §6)* | — | yes |
| Schema + JSON Schema emit | Zod **v4** | `^4` | yes |
| Config parsing | *(Bun native TOML)* | — | yes |
| MCP transport | @modelcontextprotocol/sdk | — | **deferred (v2)** |
| Confluence publish | *(plain `fetch`)* | — | **deferred** |

For how these dependencies are wired together at runtime, see
[architecture.md](architecture.md). For the build/distribution decision in full,
see [ADR 0001](../adr/0001-runtime-build-distribution.md).
