/**
 * scaffold.ts — the **pure** description of an empty, conformant OKF bundle.
 *
 * This module is the byte-source for `lore init` (lore-design §3.1): it computes,
 * with no filesystem access whatsoever, the exact directories and file contents a
 * fresh bundle needs — the `.lore/` state directory ([ADR-0013](../../docs/adr/0013-lore-state-directory.md)),
 * the Draft-7 JSON Schemas exported from the Zod source of truth
 * ([ADR-0006](../../docs/adr/0006-schema-types-templates.md)), and the reserved
 * root `docs/index.md` that carries `okf_version`
 * ([okf-conformance](../../docs/reference/okf-conformance.md)).
 *
 * Keeping it pure is what makes init testable and deterministic: {@link buildScaffold}
 * returns a {@link ScaffoldPlan} of intended bytes that golden tests pin exactly, and
 * `commands/init.ts` is the thin layer that applies the plan **idempotently** (writing
 * only absent files, never clobbering) — the side effects live there, the bytes live
 * here. The single non-deterministic input, the root index's `timestamp`, enters
 * through an injected option (lore-design §8), so the same options always yield the
 * same plan.
 *
 * Scope (confirmed for LORE-17): an empty bundle only. Full index/log *generation*
 * (`bundle.generateIndexes`, `log.md`) is M3 / `lore sync` and is **not** done here —
 * init writes a *minimal* root index. Per-type template *content* is `lore new`'s
 * concern (LORE-18, which carries built-in fallbacks); init only ensures the
 * `.lore/templates/` directory exists.
 */

import { type Concept, idFromPath, serializeConcept } from "./concept";
import { jsonSchemaFor, KNOWN_TYPES, type KnownType, schemaFileName, schemaModeline } from "./schema";

/** The OKF version this producer emits; carried by the root index alone (okf-conformance). */
const OKF_VERSION = "0.1";

/** The reserved bundle-root index — the only file that carries `okf_version`. */
const ROOT_INDEX_PATH = "docs/index.md";

/** A single file the scaffold wants to exist, with the exact bytes to write when it is absent. */
export interface ScaffoldFile {
  /** Repo-relative POSIX path. */
  readonly path: string;
  /** The exact bytes to write — pinned by golden tests, applied verbatim by the command. */
  readonly contents: string;
}

/**
 * The complete, filesystem-free description of an empty bundle. `dirs` are ensured to
 * exist (idempotent `mkdir -p`, in parent-first order); `files` are created only when
 * absent so a re-run never clobbers user edits (the AC#2 idempotency contract).
 */
export interface ScaffoldPlan {
  /** Directories to ensure exist, parents before children. */
  readonly dirs: readonly string[];
  /** Files to create if absent, in a stable order. */
  readonly files: readonly ScaffoldFile[];
}

/** Options for {@link buildScaffold}; the timestamp is the one injected determinism seam. */
export interface ScaffoldOptions {
  /**
   * ISO-8601 datetime (e.g. `2026-06-25T12:00:00Z`) stamped on the generated root
   * index. Injected by the command from its clock so the plan is deterministic and
   * golden-testable (lore-design §8).
   */
  readonly timestamp: string;
}

/**
 * Build the {@link ScaffoldPlan} for an empty OKF bundle: the `.lore/` state tree, the
 * six exported JSON Schemas, and the reserved root `docs/index.md`. Pure — it touches
 * no filesystem and reads no clock; identical `options` always produce identical bytes.
 */
export function buildScaffold(options: ScaffoldOptions): ScaffoldPlan {
  return {
    dirs: [".lore", ".lore/schemas", ".lore/templates", ".lore/cache", "docs"],
    files: [
      { path: ".lore/config.toml", contents: DEFAULT_CONFIG_TOML },
      { path: ".lore/.gitignore", contents: LORE_GITIGNORE },
      ...schemaFiles(),
      // Materialize the templates directory without committing to per-type content:
      // `lore new` (LORE-18) owns the template bodies and their override-if-present
      // logic, so init only keeps the directory tracked.
      { path: ".lore/templates/.gitkeep", contents: "" },
      { path: ROOT_INDEX_PATH, contents: rootIndexDocument(options.timestamp) },
    ],
  };
}

/**
 * One {@link ScaffoldFile} per known type, each the Draft-7 JSON Schema exported from
 * the Zod source of truth, pretty-printed with a trailing newline. Emitted in
 * {@link KNOWN_TYPES} order so the plan (and its golden) is stable. The 2-space,
 * newline-terminated formatting is the byte contract these schema files commit to.
 */
function schemaFiles(): ScaffoldFile[] {
  return KNOWN_TYPES.map((type: KnownType) => ({
    path: `.lore/schemas/${schemaFileName(type)}`,
    contents: `${JSON.stringify(jsonSchemaFor(type), null, 2)}\n`,
  }));
}

/**
 * The minimal reserved root index: byte-stable frontmatter (a `Reference` carrying
 * `okf_version: "0.1"` — the sole carrier in the bundle) via {@link serializeConcept},
 * with the editor modeline inserted as the **first line inside** the `---` fence.
 *
 * The modeline sits *inside* the frontmatter, not above it, because that is the only
 * placement that both (a) lets lore read the file back as a concept — `parseConcept`
 * needs `---` at byte 0, so an above-fence comment would make `loadBundle` skip the
 * index as a non-concept — and (b) matches every modeline-bearing doc already in this
 * bundle. (Trade-off: js-yaml drops the in-fence comment if the file is ever
 * re-serialized — a documented round-trip limitation in concept.ts that applies to all
 * such docs equally; `init` writes the index once and never rewrites it.)
 */
function rootIndexDocument(timestamp: string): string {
  const concept: Concept = {
    id: idFromPath(ROOT_INDEX_PATH),
    path: ROOT_INDEX_PATH,
    type: "Reference",
    frontmatter: {
      type: "Reference",
      title: "Documentation",
      summary: "Root index of this OKF documentation bundle, created by `lore init`.",
      timestamp,
      okf_version: OKF_VERSION,
    },
    body: ROOT_INDEX_BODY,
  };
  const modeline = schemaModeline(ROOT_INDEX_PATH, "Reference");
  // serializeConcept emits `---\n<yaml>---\n<body>`; splice the modeline in as the
  // first line within the opening fence.
  return serializeConcept(concept).replace("---\n", `---\n${modeline}\n`);
}

/** The body of the scaffolded root index (after the frontmatter fence). */
const ROOT_INDEX_BODY = `
# Documentation

This is the root index of an OKF documentation bundle, created by \`lore init\`.
Add concepts under \`docs/\` and link them from here. This file is the bundle's
entry point and the only one that carries \`okf_version\`.
`;

/** The committed `.lore/.gitignore`: keep the transient cache out of git (ADR-0013). */
const LORE_GITIGNORE = `# lore transient cache — recomputable, machine-local, never committed (ADR-0013).
cache/
`;

/**
 * The default, fully-commented `.lore/config.toml`. Every setting is shown commented
 * because lore is zero-config: a missing file — or one with every line commented —
 * yields the documented defaults (ADR-0013), so a fresh `init` produces a file that
 * changes nothing until a team uncomments a knob. The committed-token guard in
 * config.ts still applies; the Confluence token is environment-only.
 */
const DEFAULT_CONFIG_TOML = `# lore configuration — committed, team-shared knobs for \`lore sync\` / \`lore check\`.
# Every setting is OPTIONAL: with this file absent, or every line below commented,
# lore uses the documented defaults. See docs/adr/0013-lore-state-directory.md.

# [reconcile]
# Status roll-up policy applied by \`lore sync\` / \`lore check\`.
# mode = "task-rollup"   # all tasks Done -> done; any In Progress -> in-progress; else todo

# [validate]
# external_links = false       # external-link liveness is opt-in only
# promote_portability = false  # keep the portability lint a warning, not an error

# [confluence]
# Non-secret publish target settings (the one-way publish adapter is deferred to v2).
# The API token is environment-only: set $LORE_CONFLUENCE_TOKEN, never store it here.
# base_url       = "https://yourorg.atlassian.net/wiki"
# space          = "ENG"
# parent_page_id = "98765"
# format         = "storage"   # or "adf"
`;
