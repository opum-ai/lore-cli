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
 * (`indexes.generateIndexes`, `log.ts` → `log.md`) is M3 / `lore sync` and is **not** done here —
 * init writes a *minimal* root index. Per-type template *content* is `lore new`'s
 * concern (LORE-18, which carries built-in fallbacks); init only ensures the
 * `.lore/templates/` directory exists.
 */

import { CONFIG_REL_PATH } from "../config";
import { type Concept, idFromPath, serializeConcept, serializeConceptWithModeline } from "./concept";
import { defaultProfile, PROFILE_REL_PATH, type Profile } from "./profile";
import { emitSchemaFiles, schemaModeline } from "./schema";

/**
 * The bundle root — the directory every concept lives under, relative to the repo root.
 * The single source of truth for the `docs/` convention, shared by the scaffolder, the
 * bundle walk, and `lore new`'s output-path computation so they never spell it differently.
 */
export const DOCS_DIR = "docs";

/** The reserved bundle-root index — the only file that carries `okf_version`. */
const ROOT_INDEX_PATH = `${DOCS_DIR}/index.md`;

/**
 * Reserved file stems that name machine-generated hubs (`index.md`, `log.md`): regenerated
 * wholesale by `lore sync`, never a rename/supersede/link/unlink principal. Shared by
 * `commands/rename.ts`, `commands/supersede.ts`, and `commands/link.ts` — each guards its own
 * concept-id argument(s) against it.
 */
export const RESERVED_STEMS: ReadonlySet<string> = new Set(["index", "log"]);

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
  /**
   * The active profile whose types drive the emitted JSON Schemas and whose `okfVersion` stamps
   * the root index. Defaults to the built-in {@link defaultProfile}, so a zero-config `lore init`
   * scaffolds the six story-convention schemas exactly as before.
   */
  readonly profile?: Profile;
}

/**
 * Build the {@link ScaffoldPlan} for an empty OKF bundle: the `.lore/` state tree, one exported
 * JSON Schema per profile type, and the reserved root `docs/index.md`. Pure — it touches no
 * filesystem and reads no clock; identical `options` always produce identical bytes.
 */
export function buildScaffold(options: ScaffoldOptions): ScaffoldPlan {
  const profile = options.profile ?? defaultProfile();
  return {
    dirs: [".lore", ".lore/schemas", ".lore/templates", ".lore/cache", DOCS_DIR],
    files: [
      { path: CONFIG_REL_PATH, contents: DEFAULT_CONFIG_TOML },
      { path: PROFILE_REL_PATH, contents: DEFAULT_PROFILE_TOML },
      { path: ".lore/.gitignore", contents: LORE_GITIGNORE },
      ...schemaFiles(profile),
      // Materialize the templates directory without committing to per-type content:
      // `lore new` (LORE-18) owns the template bodies and their override-if-present
      // logic, so init only keeps the directory tracked.
      { path: ".lore/templates/.gitkeep", contents: "" },
      { path: ROOT_INDEX_PATH, contents: rootIndexDocument(options.timestamp, profile) },
    ],
  };
}

/**
 * One {@link ScaffoldFile} per profile type, each the generated Draft-7 JSON Schema pretty-printed
 * with a trailing newline, in the profile's type-declaration order so the plan (and its golden) is
 * stable. Delegates to the shared {@link emitSchemaFiles} (the byte contract `lore schema export`
 * reuses), so a scaffolded schema and a re-exported one can never diverge.
 */
function schemaFiles(profile: Profile): ScaffoldFile[] {
  return emitSchemaFiles(profile);
}

/**
 * The minimal reserved root index: byte-stable frontmatter (a `Reference` carrying
 * `okf_version: "0.1"` — the sole carrier in the bundle), with the editor modeline
 * spliced in as the **first line inside** the `---` fence via
 * {@link serializeConceptWithModeline} (the shared placement seam in concept.ts).
 *
 * The modeline sits *inside* the frontmatter, not above it, because that is the only
 * placement that both (a) lets lore read the file back as a concept — `parseConcept`
 * needs `---` at byte 0, so an above-fence comment would make `loadBundle` skip the
 * index as a non-concept — and (b) matches every modeline-bearing doc already in this
 * bundle. (Trade-off: js-yaml drops the in-fence comment if the file is ever
 * re-serialized — a documented round-trip limitation in concept.ts that applies to all
 * such docs equally; `init` writes the index once and never rewrites it.)
 */
function rootIndexDocument(timestamp: string, profile: Profile): string {
  const concept: Concept = {
    id: idFromPath(ROOT_INDEX_PATH),
    path: ROOT_INDEX_PATH,
    type: ROOT_INDEX_TYPE,
    frontmatter: {
      type: ROOT_INDEX_TYPE,
      title: "Documentation",
      summary: "Root index of this OKF documentation bundle, created by `lore init`.",
      timestamp,
      okf_version: profile.okfVersion,
    },
    body: ROOT_INDEX_BODY,
  };
  // The root index is lore's OWN reserved structural file with a fixed shape, not a user concept,
  // so it is serialized/validated against the built-in default profile — never the active one. A
  // custom profile that retypes `Reference` (e.g. adds a required field) therefore cannot make
  // `lore init` abort while writing docs/index.md. (Only `okf_version` above is profile-derived.)
  // The modeline is carried only when the *active* profile defines the type, so the `$schema` it
  // points at was actually emitted under `.lore/schemas/`.
  const structural = defaultProfile();
  return profile.types.has(ROOT_INDEX_TYPE)
    ? serializeConceptWithModeline(concept, schemaModeline(ROOT_INDEX_PATH, ROOT_INDEX_TYPE), {
        profile: structural,
      })
    : serializeConcept(concept, { profile: structural });
}

/** The reserved root index's `type` — lore's bundle entry point is conventionally a `Reference`. */
const ROOT_INDEX_TYPE = "Reference";

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

/**
 * The default, fully-commented `.lore/profile.toml`. The profile is the declarative source of
 * truth for the type vocabulary (ADR-0006): with this file absent — or every line below
 * commented — lore uses the built-in story-convention profile (Epic/Story/Spec/ADR/Runbook/
 * Reference), so a fresh `init` produces a file that changes nothing until a team defines its own
 * types. It is separate from `config.toml`: config carries operational knobs, the profile carries
 * the type system. See docs/adr/0006-schema-types-templates.md.
 */
const DEFAULT_PROFILE_TOML = `# lore profile — committed, declarative type vocabulary for this bundle.
# OPTIONAL: with this file absent, or every line below commented, lore uses the built-in
# story-convention profile (Epic/Story/Spec/ADR/Runbook/Reference). Fill it in to define your
# own types. lore generates its runtime validators + editor JSON Schemas from this file at load.

# [profile]
# name = "my-project"      # required once any line below is uncommented
# okf_version = "0.1"      # required; asserted against the bundle-root index.md
# case = "Title"           # type-name casing convention (advisory; powers the did-you-mean hint)
# resource_base = ""       # prefix for the stamped \`resource\` link (empty = none)

# [base.fields]
# Fields every type carries. \`type\` MUST be required (OKF's one hard requirement).
# type = { required = true }
# title = {}
# description = {}
# tags = { kind = "list" }
# summary = {}
# timestamp = { kind = "datetime" }

# [[types]]
# name = "Spec"                       # the OKF \`type\` value
# sections = ["Summary", "Design"]    # required body headings (## …)
# template = "spec.md"                # template under .lore/templates/
# fields = { feature = { required = true }, status = { enum = ["draft", "approved"] } }
`;
