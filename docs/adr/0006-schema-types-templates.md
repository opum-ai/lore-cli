---
type: ADR
title: "ADR-0006: Schema, types & templates: Zod as source of truth"
description: Frontmatter schemas are authored in Zod (strict for known types, lenient for unknown), exported to Draft-7 JSON Schema with an editor modeline, and paired with file-based templates for scaffolding.
tags: [schema, zod, json-schema, frontmatter, templates, types, validation]
summary: lore derives frontmatter validation, editor schemas, and typed concept templates from a single Zod-backed model.
timestamp: 2026-06-21T00:00:00Z
---

# ADR-0006: Schema, types & templates: Zod as source of truth

## Status

Accepted — 2026-06-21

Amended — 2026-06-25 (LCLI-46): the source of truth is **inverted**. See the amendment below;
the original decision text is retained as the historical record.

## Amendment (LCLI-46): the declarative profile is the source of truth

The type/profile layer is now **data, not code**. A committed, declarative
`.lore/profile.toml` (see [ADR-0013](0013-lore-state-directory.md)) is the single source of
truth for the type vocabulary, each type's frontmatter shape, its required body sections, and
its template. lore **generates** its runtime Zod validators *and* the editor Draft-7 JSON
Schemas *from* the profile at load (declarative profile → generated Zod → `z.toJSONSchema`),
in [core/profile.ts](../../src/core/profile.ts). This supersedes "Zod-in-code is **the**
single source of truth" **for the type/profile layer only** — the Zod *mechanism*, the
strict-runtime/lenient-editor split, and the ISO-string date rule below all stand; they are now
fed by generated schemas rather than hand-authored ones.

Every invariant of the original decision is preserved by construction:

- **Unknown types/keys warn, never error** (OKF tolerance): generated per-type schemas are
  loose, the editor schema stays open (`additionalProperties: true`).
- **ISO-string timestamps**, never coerced to `Date` (`datetime` kind → `z.iso.datetime`).
- **Byte-stable round-trip**: an editor-advertised field `default` is surfaced in the JSON
  Schema but **never** applied at runtime, so it is never stamped onto a concept.
- **Strict-known / lenient-unknown tiers** and **JSON-Schema editor emission** are unchanged.

Two things stay **lore built-ins**, because the declarative grammar deliberately cannot express
them (the expressiveness limit is the boundary — there is no code-registration escape hatch):

- The **§5 summary-length heuristic** (warn on a missing/over-long `summary`) lives in
  [core/validate.ts](../../src/core/validate.ts).
- The **`supersedes` / `superseded_by`** coupling fields, whose `string | list-of-refs` union no
  `kind` expresses, carry a built-in validator and are present on every type.

The editor schema filename is the type's **LOWER-KEBAB slug** + `.schema.json`
(`Reference` → `reference.schema.json`, `QA Plan` → `qa-plan.schema.json`); for the single-word
story-convention types the slug equals the old lower-cased stem, so existing modelines resolve
unchanged. lore ships the built-in **story-convention** profile (Epic/Story/Spec/ADR/Runbook/
Reference) so a zero-config bundle behaves exactly as it did before this amendment.

## Context

Every non-index concept file in the bundle starts with YAML frontmatter. OKF
requires exactly one field (`type`) and recommends a handful more
(`title`, `description`, `resource`, `tags`, `timestamp`); it explicitly
instructs consumers to **tolerate unknown types and unknown keys** and to treat
the producer's type vocabulary as open. lore layers a "story convention"
(Reference / Spec / ADR / Runbook / Epic / Story) on top of that base as a
producer profile — but it must not break OKF's extension tolerance.

We therefore need one schema mechanism that simultaneously:

1. **Validates** frontmatter at runtime so `lore validate` /
   `lore check` can enforce per-type shape and required sections (see
   [ADR-0010: Validation tiers](0007-validation-and-coherence.md)).
2. **Drives editor experience** — humans and agents authoring `.md` should get
   autocomplete and inline error squiggles before they ever run a CLI command.
3. **Honors OKF tolerance** — unknown `type` values and arbitrary custom
   frontmatter keys must pass through untouched, never be dropped or rejected.
4. **Stays the single definition** — no second hand-maintained JSON Schema file
   that drifts from the runtime validator.

A few specific forces shaped the decision:

- **TypeScript-native, runtime-first.** lore is Bun + TypeScript
  (see [ADR-0001: Runtime, build & distribution](0001-runtime-build-distribution.md))
  and the core must be deterministic with no LLM dependency. We want types
  inferred *from* the validator, not duplicated alongside it.
- **Editor tooling speaks JSON Schema, not Zod.** The Red Hat YAML extension
  (`yaml-language-server`) — used by VS Code, Neovim, and others, and the de
  facto standard for inline YAML validation — consumes JSON Schema via a
  `# yaml-language-server: $schema=` modeline comment at the top of a YAML
  document or frontmatter block. There is no native "validate against Zod"
  editor path.
- **Dates are interchange, not objects.** Frontmatter is serialized YAML;
  timestamps must round-trip losslessly across gray-matter, git diffs, GitHub,
  Obsidian, MkDocs, and Docusaurus. Coercing to `Date` objects invites
  timezone/serialization ambiguity.
- **This is a proven pattern.** Astro Content Collections and Velite both author
  content frontmatter schemas in Zod and surface them to authors via generated
  types / JSON Schema. We are adopting an established approach, not inventing one.

## Decision

**Zod is the single source of truth for all frontmatter shapes.** Everything
else — runtime validation, TypeScript types, JSON Schema for editors,
documentation — is derived from the Zod schemas.

### 1. Per-type schemas: strict for known, lenient for unknown

We author one Zod schema per known `type` in the story convention. Each known
schema is **strict on its declared fields** (correct shape for
`type`, `title`, `description`, `tags`, `summary`, `timestamp`, plus any
per-type fields such as a Story's task linkage), and validated at runtime by
`lore validate` / `lore check`.

For an **unknown** `type` (a user-defined producer extension), lore falls back
to a **lenient schema that requires only a non-empty `type` string** and lets
every other key pass through. This is exactly OKF §9's tolerance rule expressed
as code: unknown types are a *warning*, not an error
(see [ADR-0010](0007-validation-and-coherence.md)).

```ts
// shape-only sketch; see core/schema.ts
const Timestamp = z.string().datetime();           // ISO 8601, NOT z.date()

const Base = z.object({
  type:        z.string().min(1),
  title:       z.string().optional(),
  description: z.string().optional(),
  tags:        z.array(z.string()).optional(),
  summary:     z.string().optional(),              // see §5
  timestamp:   Timestamp.optional(),
});

// Known type: strict on declared fields.
const Story = Base.extend({
  type:  z.literal("Story"),
  tasks: z.array(z.string()).optional(),           // backlog task IDs it owns
}).strict();                                        // unexpected keys flagged at runtime

// Unknown type: type-only, everything else passes through.
const Unknown = z.object({ type: z.string().min(1) }).passthrough();
```

The runtime validator picks the schema by `type` value; if no known schema
matches, it uses `Unknown` and emits the "unknown type" warning rather than
failing.

### 2. Dates as ISO strings, not coerced `Date`s

Timestamps are modeled with `z.string().datetime()` (ISO 8601) and kept as
strings end-to-end. lore never coerces frontmatter dates into JavaScript `Date`
objects. This guarantees byte-stable round-tripping through gray-matter and
clean git diffs, and avoids implicit timezone drift. (`timestamp` values in this
bundle are written as `2026-06-21T00:00:00Z`.)

### 3. Emit Draft-7 JSON Schema + inject an editor modeline

For each type we export a **Draft-7 JSON Schema** via Zod's
`z.toJSONSchema()` (`target: "draft-7"`), written under `.lore/schemas/`.
`lore new` then injects a modeline as the **first line of the file**:

```markdown
# yaml-language-server: $schema=../../.lore/schemas/story.json
---
type: Story
title: …
---
```

With this comment present, `yaml-language-server` validates the frontmatter
live and offers key/enum autocomplete — for humans in their editor and for any
agent whose tooling honors the same LSP. The CLI's runtime validation and the
editor's live validation are then guaranteed consistent because both descend
from the same Zod definitions.

**Crucially, the *exported* JSON Schema is more lenient than the runtime
check:** the editor schema uses `additionalProperties: true` (open) so that an
author's custom keys never light up as errors mid-edit, honoring OKF
producer-extension tolerance. The stricter "no unexpected keys" enforcement
lives only in the CLI's runtime path (`.strict()` above), where it is a
deliberate, reviewable gate rather than ambient editor noise. Editor = guide;
CLI = gate.

### 4. User-defined types and custom frontmatter pass through

Producers may invent new `type` values and attach arbitrary frontmatter keys.
lore neither rejects nor strips them: unknown types validate against the
lenient schema, and on read/write the full frontmatter object is preserved
verbatim (gray-matter round-trip). lore-managed commands
(`sync`, `rename`, `supersede`, `replace`) only touch the keys they own and
leave everything else byte-identical.

### 5. The `summary` frontmatter field

We add a per-type **`summary`** field — one sentence — distinct from the longer
`description`. It is consumed wherever lore needs a compact one-liner: index
listings, `lore query` result snippets, and the neighbor-compaction in
`lore context` (see [ADR-0013: Retrieval](0015-lightweight-retrieval-no-vectors.md)).
`summary` is recommended, not required: validation **warns** if it is missing or
runs much longer than ~200 characters, but never errors.

### 6. Templates: `lore new --template`

Scaffolding is file-based and overridable. `lore new <type> "<title>"` resolves
its body from `.lore/templates/<type>.md` when present, falling back to a
built-in default for the known story-convention types. Templates are plain
markdown with `{{placeholder}}` tokens; `--var key=value` supplies values, and
common tokens (`{{title}}`, `{{type}}`, `{{timestamp}}`, the modeline path) are
filled automatically. This keeps scaffolding deterministic and customizable
per-repo without code changes, and lets teams template required sections so new
concepts validate on first save.

## Consequences

### Positive

- **One definition, three outputs.** Zod yields runtime validation, inferred
  TypeScript types, and JSON Schema for editors — no second artifact to keep in
  sync, no drift.
- **Authoring feedback before the CLI runs.** The injected modeline gives humans
  and agents live autocomplete + inline validation in any
  `yaml-language-server`-aware editor, cutting the validate/fix loop.
- **OKF tolerance preserved by construction.** Unknown types and custom keys
  pass through; the editor schema is open while the CLI gate is strict — the two
  tiers map cleanly onto OKF's "error vs. tolerate" distinction
  (see [okf-conformance](../reference/okf-conformance.md)).
- **Stable interchange.** ISO-string timestamps round-trip losslessly and diff
  cleanly across GitHub, Obsidian, MkDocs, and Docusaurus
  (see [consumer-compatibility](../reference/consumer-compatibility.md)).
- **Proven pattern, low risk.** Mirrors Astro/Velite, so the approach is
  well-understood by contributors and well-supported by tooling.

### Negative / tradeoffs

- **Zod → JSON Schema is not 1:1.** Some Zod refinements (custom
  `.refine()`/`.superRefine()` predicates, cross-field constraints) have no
  Draft-7 representation, so the editor schema is necessarily a *subset* of the
  runtime check. The CLI remains the authoritative validator; the editor is a
  best-effort guide. We accept this asymmetry deliberately.
- **Modeline as the first line.** The `# yaml-language-server:` comment sits
  above the `---` frontmatter fence. It is an ordinary comment to every
  Markdown/OKF consumer and is harmless, but it is one more managed line
  `lore new` must write and that authors should not delete.
- **Schema artifacts are generated.** `.lore/schemas/*.json` are emitted from
  Zod and committed for portable editor support; a regenerate step (run in
  `lore init` / on type changes) is required to keep them current. They are
  derived, never hand-edited.
- **`z.string().datetime()` is stringly-typed.** Consumers that want a real
  `Date` must parse it themselves. This is the intended boundary — lore treats
  timestamps as interchange data, not domain objects.

## Alternatives considered

- **Hand-author JSON Schema directly.** Rejected: it would be the editor source
  *and* would still need a separate runtime validator, doubling maintenance and
  guaranteeing eventual drift — the exact failure mode this ADR exists to avoid.
- **TypeBox (JSON-Schema-first).** Generates JSON Schema natively, but its
  runtime ergonomics and ecosystem fit are weaker for us than Zod, and Zod is
  already the idiomatic choice in the Bun/TypeScript space we target
  (see [tech-stack](../reference/tech-stack.md)). The Zod →
  `z.toJSONSchema()` path covers the same ground with a nicer authoring surface.
- **No editor schema; CLI validation only.** Rejected: it removes the
  pre-CLI feedback loop that most benefits both human authors and agents, and
  pushes all errors to a later, slower stage.
- **Coerce dates to `Date` (`z.coerce.date()` / `z.date()`).** Rejected: breaks
  byte-stable round-tripping, muddies git diffs, and introduces timezone
  ambiguity for a field that is fundamentally serialized text.
- **Strict editor schema (`additionalProperties: false`).** Rejected: it would
  flag legitimate OKF producer extensions as errors during editing, violating
  OKF tolerance. We keep the editor open and enforce strictness only at the CLI
  gate.
- **Code-only built-in templates (no `.lore/templates/`).** Rejected: file-based
  templates let teams customize scaffolding and required sections per-repo
  without forking lore, at negligible cost.

See also: [ADR-0002: OKF as documentation format](0003-okf-substrate.md),
[ADR-0008: Portable cross-links](0010-multi-consumer-docs-layer.md),
[lore-design spec](../specs/lore-design.md).
