/**
 * `lore agent context --workspace` (LCLI-432): the cross-repository evidence-pack compile.
 *
 * Covers reference expansion (unqualified fans out per selected member, an explicit `member::id`
 * pins one member), the strict-pinned/relaxed-sources split, the OPAG-33 tolerant-load path (a
 * member that fails to load is skipped and reported, not a hard failure), provenance stamping, and
 * that the bare (non-workspace) `agent context` path is unaffected.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/commands/agent";
import type { AgentContextExport } from "../src/core/agent-context";
import { loadAgentProfiles } from "../src/core/agent-profile";
import { compileWorkspaceAgentContext } from "../src/core/agent-workspace-context";
import { type BundleGraph, buildGraph } from "../src/core/bundle";
import type { Concept } from "../src/core/concept";
import { EXPECTED_LADYBUG_STORAGE_VERSION, EXPECTED_LADYBUG_VERSION } from "../src/core/ladybug-native";
import { type LadybugProjectionSource, prepareLadybugProjectionSource } from "../src/core/ladybug-source";
import { buildProjection } from "../src/core/projection";
import type { RetrievalGraph, RetrievalGraphOptions } from "../src/core/retrieval";
import { loadWorkspaceProjection } from "../src/core/workspace-source";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, makeTask } from "./helpers";

const JSON_OUTPUT: OutputContext = { mode: "json", color: false };

let root: string;
let manifestPath: string;
let sources: Map<string, LadybugProjectionSource>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-agent-workspace-"));
  mkdirSync(join(root, "members/alpha"), { recursive: true });
  mkdirSync(join(root, "members/beta"), { recursive: true });
  manifestPath = join(root, "workspace.json");
  writeManifest();
  sources = new Map([
    [
      "alpha",
      source("alpha", [
        concept("design", "Alpha design", "# Design\n\nHow alpha builds checkout forms.\n"),
        concept("glossary", "Alpha glossary", "# Terms\n\nchargeback: a reversed payment.\n"),
        concept("only-in-alpha", "Only in alpha", "# Alpha-only\n\nAlpha-specific evidence.\n"),
      ]),
    ],
    ["beta", source("beta", [concept("design", "Beta design", "# Design\n\nHow beta builds checkout forms.\n")])],
  ]);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeManifest(): void {
  writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: "lore-workspace-manifest/1",
        workspaceId: "fixture",
        members: [
          { memberId: "alpha", locator: "members/alpha", displayName: "Alpha", expectedRef: "refs/heads/main" },
          { memberId: "beta", locator: "members/beta", displayName: "Beta", expectedRef: "refs/heads/main" },
        ],
        links: [],
      },
      null,
      2,
    )}\n`,
  );
}

function source(seed: string, concepts: readonly Concept[]): LadybugProjectionSource {
  const graph: BundleGraph = buildGraph(concepts);
  const projection = buildProjection({
    graph,
    tasks: [makeTask(`TASK-${seed.toUpperCase()}`, { title: `${seed} task` })],
    docsRoot: "docs",
    okfVersion: "0.1",
    exporterVersion: "0.0.0",
    gitCommit: seed === "alpha" ? "a".repeat(40) : "b".repeat(40),
    generatedAt: null,
  });
  return prepareLadybugProjectionSource({
    projection,
    inventory: [
      { path: "docs/index.md", byteLength: seed.length, byteHash: `sha256:${seed.padEnd(64, "0").slice(0, 64)}` },
    ],
    profileInventory: [],
    ladybugVersion: EXPECTED_LADYBUG_VERSION,
    ladybugStorageVersion: EXPECTED_LADYBUG_STORAGE_VERSION,
    loreVersion: "0.0.0",
    warnings: [],
  });
}

function concept(id: string, title: string, body: string): Concept {
  return { id, path: `${id}.md`, type: "Reference", frontmatter: { type: "Reference", title, summary: body }, body };
}

function profile(name: string, toml: string): void {
  const path = join(root, ".lore/agents", `${name}.toml`);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, toml);
}

function loadMemberSource({ memberId }: { memberId: string }): Promise<LadybugProjectionSource> {
  const value = sources.get(memberId);
  if (value === undefined) throw new Error(`missing source ${memberId}`);
  return Promise.resolve(value);
}

function sourceOptions() {
  return { resolveGitRef: () => "refs/heads/main", loadMemberSource };
}

function compile(
  profileName: string,
  memberIds: readonly string[],
  resolveGitRef: (memberRoot: string) => string = () => "refs/heads/main",
): Promise<AgentContextExport> {
  const snapshot = loadAgentProfiles(root);
  return compileWorkspaceAgentContext(root, snapshot, profileName, "how do we build checkout forms?", undefined, {
    manifestPath,
    memberIds,
    loadProjection: (options) => loadWorkspaceProjection({ ...options, resolveGitRef, loadMemberSource }),
  });
}

function catalogFor(data: AgentContextExport, reference: string) {
  return data.catalog.find((entry) => entry.reference === reference);
}

/** A minimal reference-backend stub — CLI-wiring tests only exercise flag parsing/dispatch. */
function bareRetrieval(_options: RetrievalGraphOptions): Promise<RetrievalGraph> {
  return Promise.resolve({ graph: buildGraph([]), backend: "reference", dispose: () => Promise.resolve() });
}

/** `runAgent` is `async`, so even a synchronous usage error surfaces as a rejected promise. */
async function expectErrorAsync(
  runError: () => Promise<unknown>,
  type: LoreError["type"],
  message: string,
): Promise<LoreError> {
  try {
    await runError();
  } catch (error) {
    expect(error).toBeInstanceOf(LoreError);
    expect((error as LoreError).type).toBe(type);
    expect(String((error as Error).message)).toContain(message);
    return error as LoreError;
  }
  throw new Error(`expected a ${type} LoreError, but it returned`);
}

describe("agent context --workspace — reference expansion", () => {
  test("an unqualified source fans out across every selected member; a qualified pin targets one member", async () => {
    profile(
      "orchestration",
      'schema_version = 1\nname = "orchestration"\ndescription = "Fleet orchestration."\nkind = "specialist"\nmax_tokens = 4000\npinned = ["alpha::glossary"]\nsources = ["design"]\n',
    );
    const data = await compile("orchestration", ["alpha", "beta"]);
    expect(catalogFor(data, "alpha::glossary")?.reason).toBe("pinned");
    expect(catalogFor(data, "alpha::design")).toBeDefined();
    expect(catalogFor(data, "beta::design")).toBeDefined();
    expect(data.pinned[0]?.provenance?.memberId).toBe("alpha");
    const rankedMemberIds = data.sections.map((item) => item.provenance?.memberId).sort();
    expect(rankedMemberIds).toEqual(["alpha", "beta"]);
  });

  test("sources relaxed: a reference missing from one member is reported, not fatal", async () => {
    profile(
      "specialist",
      'schema_version = 1\nname = "specialist"\ndescription = "Specialist."\nkind = "specialist"\nmax_tokens = 4000\nsources = ["only-in-alpha"]\n',
    );
    const data = await compile("specialist", ["alpha", "beta"]);
    expect(catalogFor(data, "alpha::only-in-alpha")?.reason).not.toBe("missing-in-member");
    const missing = catalogFor(data, "beta::only-in-alpha");
    expect(missing?.reason).toBe("missing-in-member");
    expect(missing?.memberId).toBe("beta");
  });

  test("pinned strict: a reference missing from one member is a hard failure", async () => {
    profile(
      "specialist",
      'schema_version = 1\nname = "specialist"\ndescription = "Specialist."\nkind = "specialist"\nmax_tokens = 4000\npinned = ["only-in-alpha"]\n',
    );
    await expect(compile("specialist", ["alpha", "beta"])).rejects.toThrow("beta");
  });

  test("pinned strict: an explicitly qualified reference naming an unselected member is a hard failure", async () => {
    profile(
      "specialist",
      'schema_version = 1\nname = "specialist"\ndescription = "Specialist."\nkind = "specialist"\nmax_tokens = 4000\npinned = ["beta::design"]\n',
    );
    await expect(compile("specialist", ["alpha"])).rejects.toThrow("not selected");
  });
});

describe("agent context --workspace — tolerant loading (OPAG-33)", () => {
  test("a member that fails to load is skipped, named once, and its sources are reported member-skipped", async () => {
    profile(
      "specialist",
      'schema_version = 1\nname = "specialist"\ndescription = "Specialist."\nkind = "specialist"\nmax_tokens = 4000\nsources = ["design"]\n',
    );
    const data = await compile("specialist", ["alpha", "beta"], (memberRoot) =>
      memberRoot.endsWith("beta") ? "refs/heads/wrong" : "refs/heads/main",
    );
    expect(data.skippedWorkspaceMembers).toEqual([
      { memberId: "beta", reason: expect.stringContaining("expected refs/heads/main") },
    ]);
    expect(catalogFor(data, "alpha::design")?.reason).not.toBe("member-skipped");
    expect(catalogFor(data, "beta::design")?.reason).toBe("member-skipped");
  });
});

describe("agent context --workspace — CLI wiring", () => {
  test("lore agent context --workspace compiles a real cross-repo pack over --json", async () => {
    // Qualified references only, deliberately: `validateAgentProfileReferences` still runs
    // unconditionally against the BARE local graph for every action (LCLI-432 skips only `::`
    // references there — see agent-profile.ts), and `bareRetrieval` below is an empty stub. An
    // unqualified reference would need to also exist in the local bundle to pass that bare check;
    // that expansion behavior is already covered by the direct `compileWorkspaceAgentContext` unit
    // tests above. This test's only job is proving the CLI flags actually reach the compiler.
    profile(
      "specialist",
      'schema_version = 1\nname = "specialist"\ndescription = "Specialist."\nkind = "specialist"\nmax_tokens = 4000\npinned = ["alpha::glossary"]\nsources = ["alpha::design", "beta::design"]\n',
    );
    const stdout = capture();
    const code = await runAgent({
      root,
      output: JSON_OUTPUT,
      args: [
        "context",
        "specialist",
        "--task",
        "how do we build checkout forms?",
        "--workspace",
        manifestPath,
        "--repository",
        "alpha",
        "--repository",
        "beta",
      ],
      stdout,
      retrieval: bareRetrieval,
      loadWorkspaceProjection: (options) => loadWorkspaceProjection({ ...options, ...sourceOptions() }),
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(stdout.text()) as { kind: string; data: AgentContextExport };
    expect(envelope.kind).toBe("agent.context.export");
    expect(catalogFor(envelope.data, "alpha::glossary")?.reason).toBe("pinned");
    expect(catalogFor(envelope.data, "alpha::design")).toBeDefined();
    expect(catalogFor(envelope.data, "beta::design")).toBeDefined();
  });

  test("--repository requires --workspace", async () => {
    profile(
      "specialist",
      'schema_version = 1\nname = "specialist"\ndescription = "Specialist."\nkind = "specialist"\nmax_tokens = 4000\nsources = ["design"]\n',
    );
    await expectErrorAsync(
      () =>
        runAgent({
          root,
          output: JSON_OUTPUT,
          args: ["context", "specialist", "--task", "x", "--repository", "alpha"],
          stdout: capture(),
          retrieval: bareRetrieval,
        }),
      "usage",
      "--repository requires --workspace",
    );
  });

  test("--workspace is rejected together with --contract", async () => {
    profile(
      "specialist",
      'schema_version = 1\nname = "specialist"\ndescription = "Specialist."\nkind = "specialist"\nmax_tokens = 4000\nsources = ["design"]\n',
    );
    await expectErrorAsync(
      () =>
        runAgent({
          root,
          output: JSON_OUTPUT,
          args: ["context", "specialist", "--contract", "opum-agent-workflow/v1", "--workspace", manifestPath],
          stdout: capture(),
          retrieval: bareRetrieval,
        }),
      "usage",
      "--workspace is not available with --contract",
    );
  });
});
