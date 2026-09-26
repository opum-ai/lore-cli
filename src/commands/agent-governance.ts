/**
 * commands/agent-governance.ts — find the documents `lore agents` renders into its managed block
 * (LCLI-597, OPAG-425 R8).
 *
 * When the bundle has a Constitution, the `lore:agents` block carries its path, version, and each
 * principle's id with its MUST / MUST NOT lines; when it has a Constants document, one pointer line
 * with an observable trigger plus `id = value` for each hot entry. The rendering is pure and lives
 * with the types' other rules (`core/type-rules.ts`, the `agentBlock` facet); this module is the
 * filesystem half: walk the bundle, peek each file's `type`, and hand the first document of each
 * type that has the facet to {@link agentBlockLines}.
 *
 * It resolves types exactly the way `lore check`'s per-file peek does (`commands/check.ts`): the
 * repository's own profile, adjusted for the bundle's OKF version, the root index judged against the
 * built-in profile, and {@link typeRuleFor}, which yields a rule only when the type resolves to
 * lore's OWN built-in declaration. So a project whose `.lore/profile.toml` declares its own
 * `Constitution` gets nothing rendered, exactly as it gets none of the built-in checks (OPAG-425
 * Amendment 3, R12).
 *
 * The first document of a type in the walk's sorted order is the one rendered, the same one
 * `lore check`'s singleton rule names as "already one" when a bundle holds two. A file whose
 * frontmatter cannot be parsed is skipped rather than failing `lore agents`: judging it is `lore
 * check`'s job, and one broken document must not take every agent bridge down with it. A malformed
 * `.lore/profile.toml` or bundle-root index is different — without either, lore cannot tell which
 * documents ARE a Constitution — and fails loud, as every other profile-reading command does.
 */

import { statSync } from "node:fs";
import { join, posix } from "node:path";
import { effectiveProfileFor, loadBundleState, walkMarkdown } from "../core/bundle";
import { bodyText } from "../core/check";
import { tryReadFrontmatter } from "../core/concept";
import { loadProfile, profileForBundle } from "../core/profile";
import { DOCS_DIR } from "../core/scaffold";
import { canonicalType } from "../core/schema";
import { type AgentBlockDoc, agentBlockLines, typeRuleFor } from "../core/type-rules";
import { readSource } from "./discover";

/** The bundle-root index in {@link walkMarkdown}'s bundle-relative path space (see `effectiveProfileFor`). */
const BUNDLE_ROOT_INDEX = "index.md";

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
  const bundleProfile = profileForBundle(loadProfile({ root }), loadBundleState(docsRoot));
  const docs = new Map<string, AgentBlockDoc>();
  for (const rel of walkMarkdown(docsRoot, undefined)) {
    const display = posix.join(DOCS_DIR, rel);
    const raw = readSource(join(docsRoot, rel), display);
    let frontmatter: Record<string, unknown> | null;
    let body: string;
    try {
      frontmatter = tryReadFrontmatter(display, raw);
      if (frontmatter === null || typeof frontmatter.type !== "string" || frontmatter.type.trim() === "") {
        continue;
      }
      body = bodyText(raw);
    } catch {
      continue; // unparseable frontmatter: `lore check` reports it; `lore agents` renders around it
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

/** Whether `path` is a directory; absent (or anything else) is simply "no bundle to render from". */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
