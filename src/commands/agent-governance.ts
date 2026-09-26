/**
 * commands/agent-governance.ts — find the documents `lore agents` renders into its managed block
 * (LCLI-597, OPAG-425 R8).
 *
 * When the bundle has a Constitution, the `lore:agents` block carries its path, version, and each
 * principle's id with its MUST / MUST NOT rules; when it has a Constants document, one pointer line
 * with an observable trigger plus `id = value` for each hot entry. The rendering is pure and lives
 * with the types' other rules (`core/type-rules.ts`, the `agentBlock` facet); this module is the
 * filesystem half: walk the bundle, peek each file's `type`, and hand the first document of each
 * type that has the facet to {@link agentBlockLines}.
 *
 * It reads the file set `lore check` judges and resolves types the way `lore check`'s per-file peek
 * does (`commands/check.ts`):
 *
 * - **Files:** `docs/`'s markdown minus everything git ignores ({@link walkUnignoredMarkdown}). The
 *   block is committed, so it must be computable from a clean clone: an ignored local draft must not
 *   reach it (LCLI-597 review S2).
 * - **Types:** the repository's own profile, adjusted for the bundle's OKF version, the root index
 *   judged against the built-in profile, and {@link typeRuleFor}, which yields a rule only when the
 *   type resolves to lore's OWN built-in declaration. So a project whose `.lore/profile.toml`
 *   declares its own `Constitution` gets nothing rendered, exactly as it gets none of the built-in
 *   checks (OPAG-425 Amendment 3, R12).
 *
 * The first document of a type in the walk's sorted order is the one rendered, the same one
 * `lore check`'s singleton rule names as "already one" when a bundle holds two. A file that cannot be
 * read, or whose frontmatter cannot be parsed, is skipped rather than failing `lore agents`: judging
 * it is `lore check`'s job, and one broken document must not take every agent bridge down with it
 * (review S5). A malformed `.lore/profile.toml` or `docs/index.md` is different — without either,
 * lore cannot tell which documents ARE a Constitution — and fails loud, as every other
 * profile-reading command does (opum-agent ruling, 2026-09-26).
 */

import { statSync } from "node:fs";
import { join, posix } from "node:path";
import { effectiveProfileFor } from "../core/bundle";
import { bodyText } from "../core/check";
import { tryReadFrontmatter } from "../core/concept";
import { type BundleState, resolveBundleState } from "../core/okf-version";
import { loadProfile, profileForBundle } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
import { canonicalType } from "../core/schema";
import { type AgentBlockDoc, agentBlockLines, typeRuleFor } from "../core/type-rules";
import { LoreError, readFileIfPresent } from "../errors";
import { readSource, walkUnignoredMarkdown } from "./discover";

/** The bundle-root index in the walk's bundle-relative path space (see `effectiveProfileFor`). */
const BUNDLE_ROOT_INDEX = "index.md";

/** The bundle-root index as the user knows it, which every message about it names. */
const BUNDLE_ROOT_INDEX_DISPLAY = posix.join(DOCS_DIR, BUNDLE_ROOT_INDEX);

/**
 * The Constitution core and Constants pointer lines for the `lore:agents` managed block of the
 * repository at `root`: empty when `docs/` does not exist or holds neither document, which leaves
 * the block byte-identical to what it was before R8.
 */
export function readAgentGovernance(root: string): string[] {
  const docsRoot = join(root, DOCS_DIR);
  if (!isDirectory(docsRoot)) {
    return [];
  }
  const bundleProfile = profileForBundle(loadProfile({ root }), readBundleState(docsRoot));
  const docs = new Map<string, AgentBlockDoc>();
  for (const rel of walkUnignoredMarkdown(docsRoot)) {
    const display = posix.join(DOCS_DIR, rel);
    let frontmatter: Record<string, unknown> | null;
    let body: string;
    try {
      const raw = readSource(join(docsRoot, rel), display);
      frontmatter = tryReadFrontmatter(display, raw);
      if (frontmatter === null || typeof frontmatter.type !== "string" || frontmatter.type.trim() === "") {
        continue;
      }
      body = bodyText(raw);
    } catch {
      continue; // unreadable, or unparseable frontmatter: `lore check` reports it; `lore agents` renders around it
    }
    const judging = effectiveProfileFor(rel, BUNDLE_ROOT_INDEX, bundleProfile);
    const rule = typeRuleFor(canonicalType(frontmatter.type, judging), judging);
    if (rule?.agentBlock === undefined || docs.has(rule.type)) {
      continue;
    }
    docs.set(rule.type, { path: display, frontmatter, body });
  }
  return agentBlockLines(docs);
}

/**
 * The bundle's OKF version, negotiated from `docs/index.md` exactly as `core/bundle.ts`'s
 * `loadBundleState` does (absent file or frontmatter: the legacy path; an error issue: a
 * `validation` failure), but with every message naming `docs/index.md` rather than a bare
 * `index.md` a user cannot place (review S5). Warnings are not reported: `lore agents` has no
 * warning channel, and `lore check` prints them.
 */
function readBundleState(docsRoot: string): BundleState {
  const raw = readFileIfPresent(join(docsRoot, BUNDLE_ROOT_INDEX), BUNDLE_ROOT_INDEX_DISPLAY);
  const resolution = resolveBundleState(raw === undefined ? null : tryReadFrontmatter(BUNDLE_ROOT_INDEX_DISPLAY, raw));
  const error = resolution.issues.find((issue) => issue.severity === "error");
  if (error !== undefined) {
    throw new LoreError(
      "validation",
      `${BUNDLE_ROOT_INDEX_DISPLAY}: ${error.message}`,
      `set ${BUNDLE_ROOT_INDEX_DISPLAY} okf_version to a quoted supported value`,
      { path: BUNDLE_ROOT_INDEX_DISPLAY },
    );
  }
  return resolution.state;
}

/** Whether `path` is a directory; absent (or anything else) is simply "no bundle to render from". */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
