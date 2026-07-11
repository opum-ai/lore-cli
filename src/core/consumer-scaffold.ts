/**
 * core/consumer-scaffold.ts — the **pure** content builders behind `lore scaffold <target>`
 * (LORE-39/40; cli-surface §"Consumer scaffolding", ADR-0010).
 *
 * Each target's config is generated **additively, outside `docs/`** so the OKF bundle stays
 * the single source of truth (ADR-0010 §2): `docs/` is never mutated to satisfy a consumer.
 * Like {@link buildScaffold} (`lore init`'s pure plan builder), these functions touch no
 * filesystem and read no clock; the side effects (never-clobber vs. `--force` overwrite) live
 * in `commands/scaffold.ts`.
 *
 * `mkdocs.yml`'s exact settings (§3.3 of
 * [consumer-compatibility.md](../../docs/reference/consumer-compatibility.md)) and the
 * `docs/tags.md` tag-index page were verified against a real `mkdocs build` of this repo's own
 * bundle before being pinned here — `plugins: [tags]` alone builds cleanly, but a dedicated
 * `<!-- material/tags -->` page is what actually renders the tag index (an empty/absent one
 * leaves the plugin silently inert). `docs/tags.md` is a normal, appendable OKF concept once
 * scaffolded — not a `RESERVED_STEMS` entry like `index`/`log` — because nothing regenerates it
 * wholesale afterward; a user may rename or supersede it like any other doc.
 *
 * `docs/tags.md` is serialized against the **structural default profile**, never the active
 * one — the same choice `scaffold.ts`'s `rootIndexDocument` makes for `docs/index.md` and for
 * the identical reason: it is lore's own fixed-shape utility page, so a custom profile that adds
 * a required field to `Reference` must not make `lore scaffold mkdocs` fail to write it.
 */

import type { Concept } from "./concept";
import { idFromPath, serializeConcept, serializeConceptWithModeline } from "./concept";
import { defaultProfile, type Profile } from "./profile";
import { DOCS_DIR } from "./scaffold";
import { schemaModeline } from "./schema";

/** The repo-root-relative path of the scaffolded MkDocs config, sibling to `docs/` (ADR-0010 §2). */
export const MKDOCS_CONFIG_REL_PATH = "mkdocs.yml";

/** The repo-relative path of the scaffolded MkDocs Material tag-index page. */
export const TAGS_INDEX_REL_PATH = `${DOCS_DIR}/tags.md`;

/** A single file a consumer scaffold wants to exist, with the exact bytes to write. */
export interface ConsumerScaffoldFile {
  /** Repo-relative POSIX path. */
  readonly path: string;
  /** The exact bytes to write — pinned by golden tests, applied verbatim by the command. */
  readonly contents: string;
}

/** The complete, filesystem-free description of one consumer's scaffolded config. */
export interface ConsumerScaffoldPlan {
  /** Files to create (or, under `--force`, overwrite), in a stable order. */
  readonly files: readonly ConsumerScaffoldFile[];
}

/** Options for {@link buildMkdocsScaffold}. */
export interface ConsumerScaffoldOptions {
  /**
   * ISO-8601 datetime stamped on `docs/tags.md`'s frontmatter, mirroring `buildScaffold`'s
   * injected-clock seam (lore-design §8) so the plan stays deterministic and golden-testable.
   */
  readonly timestamp: string;
  /**
   * The MkDocs `site_name` (required by MkDocs; there is no sane zero-config default). The
   * command layer derives this from the repo directory name — the one filesystem read this
   * otherwise-pure builder needs, kept at the boundary rather than smuggled in here.
   */
  readonly siteName: string;
  /**
   * The active profile, used only to decide whether `docs/tags.md` carries the
   * `$schema` editor modeline (only when the profile actually defines `Reference`).
   * Defaults to the built-in {@link defaultProfile}.
   */
  readonly profile?: Profile;
}

/**
 * Build the {@link ConsumerScaffoldPlan} for `lore scaffold mkdocs`: a repo-root `mkdocs.yml`
 * and a `docs/tags.md` tag-index page. Pure — identical `options` always produce identical bytes.
 */
export function buildMkdocsScaffold(options: ConsumerScaffoldOptions): ConsumerScaffoldPlan {
  const profile = options.profile ?? defaultProfile();
  return {
    files: [
      { path: MKDOCS_CONFIG_REL_PATH, contents: mkdocsConfigYaml(options.siteName) },
      { path: TAGS_INDEX_REL_PATH, contents: tagsIndexDocument(options.timestamp, profile) },
    ],
  };
}

/** The reserved tag-index page's `type` — a plain `Reference`, like the bundle root index. */
const TAGS_INDEX_TYPE = "Reference";

/**
 * The `docs/tags.md` bytes: a valid OKF `Reference` concept (so it stays lint-clean and
 * OKF-legal) whose body carries the `<!-- material/tags -->` marker the MkDocs Material `tags`
 * plugin scans to render the tag index. Serialized against the structural default profile — see
 * the module docstring for why — with the `$schema` modeline included only when the *active*
 * profile defines `Reference` (mirroring `rootIndexDocument`'s same conditional).
 */
function tagsIndexDocument(timestamp: string, profile: Profile): string {
  const concept: Concept = {
    id: idFromPath(TAGS_INDEX_REL_PATH),
    path: TAGS_INDEX_REL_PATH,
    type: TAGS_INDEX_TYPE,
    frontmatter: {
      type: TAGS_INDEX_TYPE,
      title: "Tags",
      summary: "Autogenerated tag index for this OKF bundle, rendered by the MkDocs Material `tags` plugin.",
      timestamp,
    },
    body: TAGS_INDEX_BODY,
  };
  const structural = defaultProfile();
  return profile.types.has(TAGS_INDEX_TYPE)
    ? serializeConceptWithModeline(concept, schemaModeline(TAGS_INDEX_REL_PATH, TAGS_INDEX_TYPE), {
        profile: structural,
      })
    : serializeConcept(concept, { profile: structural });
}

/** The body of the scaffolded tag-index page (after the frontmatter fence). */
const TAGS_INDEX_BODY = `
# Tags

<!-- material/tags -->
`;

/**
 * The scaffolded `mkdocs.yml` bytes (consumer-compatibility.md §3.3; ADR-0010 §2). Every setting
 * mirrors that documented rationale — repeated here as inline comments since this is the file a
 * team actually reads and edits, not the doc:
 *
 * - `navigation.indexes` — `index.md` becomes each section's landing page (not just a sibling link).
 * - `plugins: [search, tags]` — the built-in search plus the frontmatter `tags` → chips/tag-index plugin.
 * - `strict: false` plus `not_found: warn` (links, nav, anchors) — honors OKF's broken-link
 *   tolerance so an in-progress or cross-tree (`backlog/`) link never fails the build.
 * - `absolute_links: relative_to_docs` (MkDocs >= 1.6) — the safety net for any `/`-absolute
 *   link that survives the portability lint.
 * - `not_in_nav: /log.md` — the machine-regenerated log stays out of the autogenerated nav tree.
 */
function mkdocsConfigYaml(siteName: string): string {
  return `# Generated once by \`lore scaffold mkdocs\` — user-owned; re-run with --force to regenerate.
# See docs/reference/consumer-compatibility.md §3.3 and ADR-0010 for the rationale.
site_name: ${JSON.stringify(siteName)}
docs_dir: docs
theme:
  name: material
  features:
    - navigation.indexes
plugins:
  - search
  - tags
strict: false
validation:
  links:
    absolute_links: relative_to_docs
    not_found: warn
    anchors: warn
  nav:
    omitted_files: ignore
    not_found: warn
not_in_nav: |
  /log.md
`;
}
