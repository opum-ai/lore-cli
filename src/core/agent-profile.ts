/**
 * Strict, repository-resident context profiles for the singular `lore agent`
 * command family. Profiles are portable retrieval policy only: they name an
 * explicit set of Lore concepts/sections and an optional direct-delegate roster.
 */

import { type Dirent, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import GithubSlugger from "github-slugger";
import { fromMarkdown } from "mdast-util-from-markdown";
import { z } from "zod";
import { errnoCode, LoreError } from "../errors";
import { type BundleGraph, nodeText, walkMdast } from "./bundle";
import { idFromPath } from "./concept";
import { compareCodeUnits } from "./order";

export const AGENT_PROFILES_DIR = ".lore/agents";
export const DEFAULT_AGENT_MAX_TOKENS = 8_000;

export type AgentProfileKind = "specialist" | "orchestrator";

export interface AgentProfileReference {
  readonly raw: string;
  readonly conceptId: string;
  readonly anchor?: string;
  readonly normalized: string;
}

export interface AgentProfile {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly description: string;
  readonly kind: AgentProfileKind;
  readonly maxTokens: number;
  readonly pinned: readonly AgentProfileReference[];
  readonly sources: readonly AgentProfileReference[];
  readonly delegates: readonly string[];
  readonly path: string;
}

export interface AgentProfileSnapshot {
  readonly profiles: ReadonlyMap<string, AgentProfile>;
}

const PROFILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ProfileFileSchema = z.strictObject({
  schema_version: z.literal(1),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["specialist", "orchestrator"]),
  max_tokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  pinned: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  delegates: z.array(z.string()).optional(),
});

type ProfileFile = z.infer<typeof ProfileFileSchema>;

/** Load every direct `.toml` profile as one validated deterministic snapshot. */
export function loadAgentProfiles(root: string): AgentProfileSnapshot {
  const dir = join(root, AGENT_PROFILES_DIR);
  const entries = readProfileDirectory(dir);
  if (entries === undefined) {
    return { profiles: new Map() };
  }

  const profiles = new Map<string, AgentProfile>();
  const foldedNames = new Map<string, string>();
  for (const entry of entries.sort((a, b) => compareCodeUnits(a.name, b.name))) {
    if (!entry.name.endsWith(".toml")) continue;
    const relPath = `${AGENT_PROFILES_DIR}/${entry.name}`;
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw validation(
        `${relPath} must be a regular file, not a symlink or directory`,
        `replace ${relPath} with a regular TOML file`,
        { path: relPath },
      );
    }
    const stem = entry.name.slice(0, -".toml".length);
    const folded = stem.toLowerCase();
    const previous = foldedNames.get(folded);
    if (previous !== undefined) {
      throw validation(
        `agent profile filenames "${previous}" and "${entry.name}" collide by case`,
        "rename one profile so every filename is unique on case-insensitive filesystems",
        { path: relPath },
      );
    }
    foldedNames.set(folded, entry.name);
    const parsed = parseProfileFile(readProfileFile(join(dir, entry.name), relPath), relPath);
    const profile = compileProfile(parsed, stem, relPath);
    profiles.set(profile.name, profile);
  }

  validateDelegateGraph(profiles);
  return { profiles };
}

/** Resolve every declared concept/anchor against one verified retrieval snapshot. */
export function validateAgentProfileReferences(snapshot: AgentProfileSnapshot, graph: BundleGraph): void {
  const slugs = new Map<string, ReadonlySet<string>>();
  for (const profile of snapshot.profiles.values()) {
    for (const reference of [...profile.pinned, ...profile.sources]) {
      const concept = graph.concepts.get(reference.conceptId);
      if (concept === undefined) {
        throw validation(
          `${profile.path} references missing concept "${reference.conceptId}"`,
          "fix the profile reference or add the concept to the active bundle",
          { path: profile.path, reference: reference.normalized },
        );
      }
      if (reference.anchor === undefined) continue;
      let headings = slugs.get(concept.id);
      if (headings === undefined) {
        headings = headingSlugs(concept.body);
        slugs.set(concept.id, headings);
      }
      if (!headings.has(reference.anchor)) {
        throw validation(
          `${profile.path} references missing heading "${reference.normalized}"`,
          "use a GitHub-compatible heading anchor that exists in the referenced concept",
          { path: profile.path, reference: reference.normalized },
        );
      }
    }
  }
}

export function findAgentProfile(snapshot: AgentProfileSnapshot, name: string): AgentProfile {
  const profile = snapshot.profiles.get(name);
  if (profile !== undefined) return profile;
  throw new LoreError(
    "not_found",
    `agent profile "${name}" was not found`,
    `add ${AGENT_PROFILES_DIR}/${name}.toml or run \`lore agent list\``,
    { profile: name },
  );
}

function readProfileDirectory(dir: string): Dirent<string>[] | undefined {
  try {
    const stat = lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw validation(
        `${AGENT_PROFILES_DIR} must be a real directory, not a symlink or file`,
        `replace ${AGENT_PROFILES_DIR} with a real directory`,
        { path: AGENT_PROFILES_DIR },
      );
    }
    return readdirSync(dir, { withFileTypes: true });
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "ENOENT") return undefined;
    if (cause instanceof LoreError) throw cause;
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError(
        "denied",
        `cannot read ${AGENT_PROFILES_DIR}`,
        `check filesystem permissions on ${AGENT_PROFILES_DIR}`,
        { path: AGENT_PROFILES_DIR, code },
      );
    }
    throw validation(
      `${AGENT_PROFILES_DIR} could not be inspected`,
      `ensure ${AGENT_PROFILES_DIR} is a readable directory`,
      { path: AGENT_PROFILES_DIR, ...(code === undefined ? {} : { code }) },
    );
  }
}

function readProfileFile(path: string, relPath: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (cause) {
    const code = errnoCode(cause);
    if (code === "EACCES" || code === "EPERM") {
      throw new LoreError("denied", `cannot read ${relPath}`, `check filesystem permissions on ${relPath}`, {
        path: relPath,
        code,
      });
    }
    throw validation(`${relPath} could not be read`, `ensure ${relPath} is a readable regular file`, {
      path: relPath,
      ...(code === undefined ? {} : { code }),
    });
  }
}

function parseProfileFile(raw: string, path: string): ProfileFile {
  let text = raw;
  while (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(text);
  } catch (cause) {
    throw validation(`${path} is not valid TOML${reason(cause)}`, `fix the TOML syntax in ${path}`, { path });
  }
  const result = ProfileFileSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const at = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    throw validation(
      `${path} does not match agent profile schema 1${at}: ${issue?.message ?? "invalid profile"}`,
      "remove unknown keys and supply the documented schema_version, name, description, kind, and profile fields",
      { path },
    );
  }
  return result.data;
}

function compileProfile(file: ProfileFile, stem: string, path: string): AgentProfile {
  if (!PROFILE_NAME.test(file.name)) {
    throw validation(`${path} has invalid profile name "${file.name}"`, "use lower-kebab names such as frontend-dev", {
      path,
      profile: file.name,
    });
  }
  if (file.name !== stem) {
    throw validation(
      `${path} declares name "${file.name}" but its filename stem is "${stem}"`,
      "make the profile name and filename stem identical",
      { path, profile: file.name },
    );
  }
  if (
    file.description.trim() === "" ||
    file.description !== file.description.trim() ||
    /[\r\n]/.test(file.description)
  ) {
    throw validation(
      `${path} description must be one non-empty trimmed line`,
      "use a concise single-line routing description",
      { path, profile: file.name },
    );
  }
  if (file.description.length > 300) {
    throw validation(`${path} description exceeds 300 characters`, "shorten the routing description", {
      path,
      profile: file.name,
    });
  }

  const pinned = parseReferences(file.pinned ?? [], path, "pinned");
  const sources = parseReferences(file.sources ?? [], path, "sources");
  assertNoReferenceOverlap(pinned, sources, path);
  const delegates = file.delegates ?? [];
  assertUniqueStrings(delegates, path, "delegates");
  for (const delegate of delegates) {
    if (!PROFILE_NAME.test(delegate)) {
      throw validation(`${path} has invalid delegate name "${delegate}"`, "use lower-kebab profile names", {
        path,
        profile: file.name,
      });
    }
  }

  if (file.kind === "specialist") {
    if (pinned.length + sources.length === 0) {
      throw validation(
        `${path} specialist profile has no pinned or ranked source`,
        "declare at least one pinned or sources reference",
        { path, profile: file.name },
      );
    }
    if (delegates.length > 0) {
      throw validation(
        `${path} specialist profile cannot declare delegates`,
        'remove delegates or use kind = "orchestrator"',
        {
          path,
          profile: file.name,
        },
      );
    }
  } else if (delegates.length === 0) {
    throw validation(`${path} orchestrator profile has no delegates`, "declare at least one direct delegate", {
      path,
      profile: file.name,
    });
  }

  return {
    schemaVersion: 1,
    name: file.name,
    description: file.description,
    kind: file.kind,
    maxTokens: file.max_tokens ?? DEFAULT_AGENT_MAX_TOKENS,
    pinned,
    sources,
    delegates,
    path,
  };
}

function parseReferences(values: readonly string[], path: string, field: string): AgentProfileReference[] {
  const refs = values.map((value) => parseAgentReference(value, path, field));
  const seen = new Set<string>();
  for (const reference of refs) {
    if (seen.has(reference.normalized)) {
      throw validation(
        `${path} repeats ${field} reference "${reference.normalized}"`,
        "remove the duplicate reference",
        { path, reference: reference.normalized },
      );
    }
    seen.add(reference.normalized);
  }
  return refs;
}

function parseAgentReference(raw: string, path: string, field: string): AgentProfileReference {
  const value = raw.trim();
  if (value === "" || value !== raw || value.includes("\\")) {
    throw validation(
      `${path} has invalid ${field} reference "${raw}"`,
      "use a trimmed POSIX bundle concept id with an optional #heading-anchor",
      { path, reference: raw },
    );
  }
  const hash = value.indexOf("#");
  const conceptPart = hash === -1 ? value : value.slice(0, hash);
  const anchor = hash === -1 ? undefined : value.slice(hash + 1);
  if (
    conceptPart === "" ||
    conceptPart.startsWith("/") ||
    posix.isAbsolute(conceptPart) ||
    conceptPart.split("/").some((segment) => segment === "..") ||
    (hash !== -1 && (anchor === undefined || anchor === "" || anchor.includes("#")))
  ) {
    throw validation(
      `${path} has invalid ${field} reference "${raw}"`,
      "use a bundle-relative concept id with one optional non-empty #heading-anchor",
      { path, reference: raw },
    );
  }
  const conceptId = idFromPath(conceptPart);
  if (conceptId === "" || conceptId === ".") {
    throw validation(`${path} has invalid ${field} reference "${raw}"`, "name a concrete bundle concept", {
      path,
      reference: raw,
    });
  }
  const normalized = anchor === undefined ? conceptId : `${conceptId}#${anchor}`;
  return { raw, conceptId, ...(anchor === undefined ? {} : { anchor }), normalized };
}

function assertNoReferenceOverlap(
  pinned: readonly AgentProfileReference[],
  sources: readonly AgentProfileReference[],
  path: string,
): void {
  const all = [...pinned.map((ref) => ({ ref, tier: "pinned" })), ...sources.map((ref) => ({ ref, tier: "sources" }))];
  for (let i = 0; i < all.length; i++) {
    const left = all[i] as { ref: AgentProfileReference; tier: string };
    for (let j = i + 1; j < all.length; j++) {
      const right = all[j] as { ref: AgentProfileReference; tier: string };
      if (left.ref.conceptId !== right.ref.conceptId) continue;
      if (
        left.ref.normalized === right.ref.normalized ||
        left.ref.anchor === undefined ||
        right.ref.anchor === undefined
      ) {
        throw validation(
          `${path} has overlapping ${left.tier}/${right.tier} references "${left.ref.normalized}" and "${right.ref.normalized}"`,
          "keep a whole document or its sections in only one tier",
          { path, reference: right.ref.normalized },
        );
      }
    }
  }
}

function assertUniqueStrings(values: readonly string[], path: string, field: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw validation(`${path} repeats ${field} value "${value}"`, `remove the duplicate ${field} value`, {
        path,
        value,
      });
    }
    seen.add(value);
  }
}

function validateDelegateGraph(profiles: ReadonlyMap<string, AgentProfile>): void {
  for (const profile of profiles.values()) {
    for (const delegate of profile.delegates) {
      if (delegate === profile.name) {
        throw validation(`${profile.path} delegates to itself`, "remove the self-delegate edge", {
          path: profile.path,
          profile: profile.name,
        });
      }
      if (!profiles.has(delegate)) {
        throw validation(
          `${profile.path} delegates to missing profile "${delegate}"`,
          `add ${AGENT_PROFILES_DIR}/${delegate}.toml or remove the delegate`,
          { path: profile.path, profile: profile.name, delegate },
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (name: string): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      const start = path.indexOf(name);
      const cycle = [...path.slice(start), name];
      const profile = profiles.get(name) as AgentProfile;
      throw validation(
        `agent delegate cycle: ${cycle.join(" -> ")}`,
        "remove at least one delegate edge so the profile graph is acyclic",
        { path: profile.path, cycle },
      );
    }
    visiting.add(name);
    path.push(name);
    const profile = profiles.get(name) as AgentProfile;
    for (const delegate of profile.delegates) visit(delegate);
    path.pop();
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of profiles.keys()) visit(name);
}

function headingSlugs(body: string): ReadonlySet<string> {
  const slugger = new GithubSlugger();
  const slugs = new Set<string>();
  walkMdast(fromMarkdown(body), (node) => {
    if (node.type === "heading") slugs.add(slugger.slug(nodeText(node)));
  });
  return slugs;
}

function reason(cause: unknown): string {
  return cause instanceof Error && cause.message.trim() !== "" ? `: ${cause.message.trim()}` : "";
}

function validation(message: string, hint: string, input: Record<string, unknown>): LoreError {
  return new LoreError("validation", message, hint, input);
}
