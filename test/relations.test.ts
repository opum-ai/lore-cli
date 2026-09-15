import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKLOG_SOURCE_ADAPTER_VERSION } from "../src/adapters/backlog";
import { run } from "../src/cli";
import { loadBundle } from "../src/core/bundle";
import { checkBundle } from "../src/core/check";
import { buildGraphExport } from "../src/core/graph";
import { defaultProfile } from "../src/core/profile";
import { buildProjection } from "../src/core/projection";
import { PROOF_RELATION_KINDS, RELATION_KINDS, readRelations, relationVersionState } from "../src/core/relations";
import { rewriteInbound } from "../src/core/rewrite";
import { capture, expectError, fakeAdapter, gitRun } from "./helpers";

/** `impact`/`path` build a traversal snapshot from the tracker, so they need one even when the
 * question is purely about concepts. An empty tracker keeps these cases about the edge selection. */
const EMPTY_TRACKER = fakeAdapter([], { listTasks: "ok" });

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-relations-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  // `impact`/`path` build their traversal snapshot from a projection, which stamps the source
  // commit — so an uninitialized directory fails with a `drift` error about git, not about edges.
  gitRun(root, ["init", "-q"]);
});
afterEach(() => {
  // A ladybug generation is sealed read-only, so the tree cannot be removed until it is not.
  makeDirectoriesWritable(root);
  rmSync(root, { recursive: true, force: true });
});

function makeDirectoriesWritable(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path)) makeDirectoriesWritable(join(path, entry));
}

function writeDoc(rel: string, contents: string): void {
  const abs = join(root, "docs", rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
}

function graph() {
  return loadBundle(join(root, "docs"));
}

function checkFiles(): ReturnType<typeof checkBundle> {
  const files = ["index.md", "claims/bound.md", "claims/lemma.md"]
    .map((path) => ({ path, raw: safeRead(path) }))
    .filter((file): file is { path: string; raw: string } => file.raw !== undefined);
  return checkBundle(files);
}

function safeRead(rel: string): string | undefined {
  try {
    return readFileSync(join(root, "docs", rel), "utf8");
  } catch {
    return undefined;
  }
}

/** The cited claim, at `claim_version` 3; pass `null` for a target that declares no version at all. */
function writeLemma(version: string | null = "3"): void {
  writeDoc(
    "claims/lemma.md",
    [
      "---",
      "type: Reference",
      "title: Monotone bound",
      "summary: The bound relied upon",
      "claim_outcome: supported",
      "claim_evidence_level: argument",
      ...(version === null ? [] : [`claim_version: "${version}"`]),
      "---",
      "The bound.",
      "",
    ].join("\n"),
  );
}

/** The citing claim. `version` is what it recorded relying on; omit it for an unversioned relation. */
function writeBound(options: { kind?: string; version?: string; target?: string; statement?: string } = {}): void {
  const { kind = "requires", target = "claims/lemma", statement = "Lemma 3.2" } = options;
  // `version` is read through an own-property check, not a destructuring default: an explicit
  // `{ version: undefined }` is how a caller asks for an UNVERSIONED relation, and a default would
  // silently turn that request back into the versioned one.
  const version = "version" in options ? options.version : "3";
  writeDoc(
    "claims/bound.md",
    [
      "---",
      "type: Reference",
      "title: Main bound",
      "summary: The claim that cites the lemma",
      "claim_outcome: open",
      "relations:",
      `  - kind: ${kind}`,
      `    target: ${target}`,
      `    statement: "${statement}"`,
      ...(version === undefined ? [] : [`    version: "${version}"`]),
      "---",
      "The main bound.",
      "",
    ].join("\n"),
  );
}

describe("the relation vocabulary", () => {
  test("every proof kind is a relation kind, and `alternative` is the only relation kind excluded", () => {
    // Pinned as an invariant rather than an example: the proof set is defined by SUBTRACTION from
    // the vocabulary, so adding a relation kind and forgetting to decide whether it bears on proof
    // must fail here rather than silently default to "not proof".
    for (const kind of PROOF_RELATION_KINDS) {
      expect(RELATION_KINDS).toContain(kind);
    }
    expect(RELATION_KINDS.filter((kind) => !(PROOF_RELATION_KINDS as readonly string[]).includes(kind))).toEqual([
      "alternative",
    ]);
  });

  test('a numeric version is normalized to its string form so `3` equals "3"', () => {
    // YAML turns an unquoted `version: 3` into a number. Comparing it against a quoted
    // `claim_version: \"3\"` must not report drift over a quoting choice the author did not make.
    const read = readRelations({ relations: [{ kind: "requires", target: "a", version: 3 }] });
    expect(read.relations[0]?.version).toBe("3");
    expect(relationVersionState("3", { claim_version: 3 })).toBe("current");
  });

  test("the four version states are distinguished, including both ways of having nothing to compare", () => {
    expect(relationVersionState("3", { claim_version: "3" })).toBe("current");
    expect(relationVersionState("3", { claim_version: "4" })).toBe("stale");
    expect(relationVersionState(undefined, { claim_version: "4" })).toBe("unversioned");
    expect(relationVersionState("3", {})).toBe("untracked");
    expect(relationVersionState("3", undefined)).toBe("untracked");
  });
});

describe("relations reach the graph (AC#1)", () => {
  test("a relation becomes an edge of its own kind carrying its statement and version", () => {
    writeLemma();
    writeBound();
    const edge = graph().edges.find((candidate) => candidate.from === "claims/bound");
    expect(edge).toMatchObject({
      from: "claims/bound",
      to: "claims/lemma",
      kind: "requires",
      statement: "Lemma 3.2",
      version: "3",
      relationOrdinal: 0,
    });
  });

  test("a relation target resolves by the same rule a flat ref does — bare id or relative path", () => {
    writeLemma();
    writeBound({ target: "./lemma.md" });
    expect(graph().edges.find((edge) => edge.from === "claims/bound")?.to).toBe("claims/lemma");
  });

  test("an unresolvable target dangles rather than disappearing", () => {
    writeLemma();
    writeBound({ target: "claims/absent" });
    const edge = graph().edges.find((candidate) => candidate.from === "claims/bound");
    expect(edge?.to).toBeNull();
    expect(edge?.target).toBe("claims/absent");
  });

  test("an unrecognised kind loads, produces NO edge, and is not mistaken for another kind", () => {
    writeLemma();
    writeBound({ kind: "implies" });
    // Loading at all is the assertion: membership is not a parse failure, so one typo cannot brick
    // a bundle. Producing no edge is the other half — a tolerated value must not be reinterpreted.
    expect(graph().edges.filter((edge) => edge.from === "claims/bound")).toEqual([]);
  });

  test("a malformed relations list is a validation error, not a tolerated one", () => {
    writeLemma();
    writeDoc("claims/bound.md", '---\ntype: Reference\ntitle: Bad\nsummary: s\nrelations: "not a list"\n---\nBody.\n');
    expectError("validation", () => graph());
  });

  test("an entry missing its target is a validation error", () => {
    writeLemma();
    writeDoc(
      "claims/bound.md",
      "---\ntype: Reference\ntitle: Bad\nsummary: s\nrelations:\n  - kind: requires\n---\nB.\n",
    );
    expectError("validation", () => graph());
  });
});

describe("claim state is its own axis (AC#3)", () => {
  test("claim fields are read back untouched and are never derived from status or the task rollup", () => {
    writeDoc(
      "claims/lemma.md",
      [
        "---",
        "type: Reference",
        "title: Lemma",
        "summary: s",
        "status: stable",
        "lore_task_status: done",
        "claim_outcome: open",
        "claim_evidence_level: assertion",
        'claim_version: "7"',
        "---",
        "Body.",
        "",
      ].join("\n"),
    );
    const concept = graph().concepts.get("claims/lemma");
    // A `stable`, delivered document whose claim is still OPEN is the whole point of the third
    // axis: if any of these were derived from the others this combination could not exist.
    expect(concept?.frontmatter.status).toBe("stable");
    expect(concept?.frontmatter.lore_task_status).toBe("done");
    expect(concept?.frontmatter.claim_outcome).toBe("open");
    expect(concept?.frontmatter.claim_evidence_level).toBe("assertion");
    expect(concept?.frontmatter.claim_version).toBe("7");
  });

  test("an unrecognised claim value loads, matching the rule that governs an unrecognised kind", () => {
    writeDoc("claims/lemma.md", "---\ntype: Reference\ntitle: L\nsummary: s\nclaim_outcome: probably\n---\nBody.\n");
    expect(graph().concepts.get("claims/lemma")?.frontmatter.claim_outcome).toBe("probably");
  });

  test("the reserved claim keys do not disturb the serialization of a document that omits them", () => {
    // ADR-0011: the new reserved keys are APPENDED to the canonical order, so a document using none
    // of them must round-trip byte-identically.
    const source = "---\ntype: Reference\ntitle: Plain\nsummary: s\n---\nBody.\n";
    writeDoc("claims/lemma.md", source);
    const concept = graph().concepts.get("claims/lemma");
    expect(Object.keys(concept?.frontmatter ?? {})).toEqual(["type", "title", "summary"]);
  });
});

describe("the proof-only view (AC#2)", () => {
  beforeEach(() => {
    writeDoc("index.md", '---\ntype: Reference\ntitle: Root\nsummary: s\nokf_version: "0.2"\n---\nRoot.\n');
    writeLemma();
  });

  test("graph --proof-only drops plain links and alternatives, and keeps the proof kinds", () => {
    writeBound({ kind: "alternative" });
    writeDoc(
      "claims/other.md",
      [
        "---",
        "type: Reference",
        "title: Other",
        "summary: s",
        "relations:",
        "  - kind: refutes",
        "    target: claims/lemma",
        "---",
        "See [lemma](./lemma.md).",
        "",
      ].join("\n"),
    );
    const kinds = buildGraphExport(graph())
      .edges.filter((edge) => PROOF_RELATION_KINDS.includes(edge.kind as (typeof PROOF_RELATION_KINDS)[number]))
      .map((edge) => edge.kind);
    expect(kinds).toEqual(["refutes"]);
    // The `alternative` relation and the body `link` both exist in the unfiltered export; they are
    // exactly what a proof view must not count as support.
    expect(
      buildGraphExport(graph())
        .edges.map((edge) => edge.kind)
        .sort(),
    ).toEqual(["alternative", "link", "refutes"]);
  });

  test("a claim with no proof relations is still a node, because an unsupported claim is the interesting case", async () => {
    writeBound({ kind: "alternative" });
    const stdout = capture();
    const code = await run(["bun", "lore", "graph", "--proof-only", "--json"], {
      cwd: root,
      stdout,
      stderr: capture(),
      isTTY: false,
      stderrIsTTY: false,
      env: {},
    });
    expect(code).toBe(0);
    const data = JSON.parse(stdout.text()).data as { nodes: { id: string }[]; edges: unknown[] };
    expect(data.nodes.map((node) => node.id)).toContain("claims/bound");
    expect(data.edges).toEqual([]);
  });

  test("--proof-only and --edge are refused together rather than intersected", async () => {
    writeBound();
    const stderr = capture();
    const code = await run(
      [
        "bun",
        "lore",
        "impact",
        "claims/bound",
        "--kind",
        "concept",
        "--direction",
        "outbound",
        "--proof-only",
        "--edge",
        "requires",
      ],
      { cwd: root, stdout: capture(), stderr, isTTY: false, stderrIsTTY: false, env: {}, adapter: EMPTY_TRACKER },
    );
    expect(code).toBe(2);
    expect(stderr.text()).toContain("--proof-only cannot be combined with --edge");
  });

  test("--proof-only on a bundle with no proof relations is empty, not a usage error", async () => {
    // An explicit `--edge requires` is rejected when the snapshot has no such kind, because that is
    // almost always a typo. The same rule applied to a PRESET would turn the correct answer — this
    // bundle records no proof relations — into an error.
    writeBound({ kind: "alternative" });
    const stdout = capture();
    const code = await run(
      [
        "bun",
        "lore",
        "impact",
        "claims/bound",
        "--kind",
        "concept",
        "--direction",
        "outbound",
        "--proof-only",
        "--json",
      ],
      { cwd: root, stdout, stderr: capture(), isTTY: false, stderrIsTTY: false, env: {}, adapter: EMPTY_TRACKER },
    );
    if (code !== 0) throw new Error(`exit ${code}: ${stdout.text()}`);
    expect((JSON.parse(stdout.text()).data as { impacts: unknown[] }).impacts).toEqual([]);
  });
});

describe("version drift is reported as a question (AC#4)", () => {
  beforeEach(() => {
    writeDoc("index.md", '---\ntype: Reference\ntitle: Root\nsummary: s\nokf_version: "0.2"\n---\nRoot.\n');
  });

  test("a dependent whose recorded version no longer matches is named for review, as a warning", () => {
    writeLemma("4");
    writeBound({ version: "3" });
    const drift = checkFiles().findings.filter((finding) => finding.rule === "relation-version-drift");
    expect(drift).toHaveLength(1);
    expect(drift[0]?.severity).toBe("warning");
    expect(drift[0]?.file).toBe("claims/bound.md");
    expect(drift[0]?.message).toContain("Lemma 3.2");
    expect(drift[0]?.message).toContain("may need review");
    // The wording must stay a question. A documentation tool can see that a cited version moved and
    // cannot see whether the argument still holds; claiming the second would be a verdict.
    expect(drift[0]?.message).not.toMatch(/invalid|broken|wrong|incorrect/i);
  });

  test("an agreeing version, an unversioned relation and an untracked target all stay quiet", () => {
    writeLemma("3");
    writeBound({ version: "3" });
    expect(checkFiles().findings.filter((finding) => finding.rule === "relation-version-drift")).toEqual([]);
    writeBound({ version: undefined });
    expect(checkFiles().findings.filter((finding) => finding.rule === "relation-version-drift")).toEqual([]);
    writeLemma(null);
    writeBound({ version: "3" });
    expect(checkFiles().findings.filter((finding) => finding.rule === "relation-version-drift")).toEqual([]);
  });

  test("the graph export says WHICH of those three quiet states it is, so silence is never ambiguous", () => {
    // This is the half that makes the absence of a drift warning readable. Without it, "no warning"
    // could mean compared-and-agreed, nothing-to-compare, or a lore that does not report drift.
    writeLemma("3");
    writeBound({ version: "3" });
    expect(relationEdge().versionState).toBe("current");
    writeBound({ version: undefined });
    expect(relationEdge().versionState).toBe("unversioned");
    writeLemma(null);
    writeBound({ version: "3" });
    expect(relationEdge().versionState).toBe("untracked");
    writeLemma("4");
    writeBound({ version: "3" });
    expect(relationEdge().versionState).toBe("stale");
  });

  test("a supersedes edge from the FLAT field carries no version state, because it cannot carry a version", () => {
    // The discriminator that makes the previous test honest: `relations[]` and the flat reserved
    // field produce the same edge kind, and only the first can record a version. Reporting the flat
    // one as `unversioned` would read as "the author omitted it" when the spelling has nowhere to
    // put it.
    writeLemma("3");
    writeDoc("claims/bound.md", "---\ntype: Reference\ntitle: B\nsummary: s\nsupersedes: claims/lemma\n---\nBody.\n");
    const edge = buildGraphExport(graph()).edges.find((candidate) => candidate.from === "claims/bound");
    expect(edge?.kind).toBe("supersedes");
    expect(edge?.versionState).toBeUndefined();
  });

  test("an unrecognised kind and an unresolvable target are each reported by file", () => {
    writeLemma();
    writeBound({ kind: "implies" });
    const unknown = checkFiles().findings.filter((finding) => finding.rule === "unknown-relation-kind");
    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.message).toContain("implies");
    expect(unknown[0]?.message).toContain("not in the graph");
    writeBound({ target: "claims/absent" });
    const broken = checkFiles().findings.filter((finding) => finding.rule === "broken-relation");
    expect(broken).toHaveLength(1);
    expect(broken[0]?.message).toContain("claims/absent");
  });
});

describe("relations survive the operations that move concepts", () => {
  test("lore rename repoints a relation target, qualifiers and all", () => {
    writeDoc("index.md", '---\ntype: Reference\ntitle: Root\nsummary: s\nokf_version: "0.2"\n---\nRoot.\n');
    writeLemma();
    writeBound();
    const plan = rewriteInbound(graph(), "claims/lemma", "claims/renamed", { move: true, profile: defaultProfile() });
    const rewritten = plan.writes.find((write) => write.path === "claims/bound.md");
    expect(rewritten?.bytes).toContain("target: claims/renamed");
    // The qualifiers are the part a naive "rewrite the whole value" would destroy.
    expect(rewritten?.bytes).toContain("statement: Lemma 3.2");
    expect(rewritten?.bytes).toContain('version: "3"');
  });

  test("the projection carries the qualifiers, and omits them entirely when unused", () => {
    writeDoc("index.md", '---\ntype: Reference\ntitle: Root\nsummary: s\nokf_version: "0.2"\n---\nRoot.\n');
    writeLemma();
    writeBound();
    const records = buildProjection({
      graph: graph(),
      tasks: [],
      sourceAdapterVersion: BACKLOG_SOURCE_ADAPTER_VERSION,
      docsRoot: "docs",
      okfVersion: "0.2",
      exporterVersion: "test",
      gitCommit: null,
      generatedAt: null,
    }).records;
    const edge = records.find((record) => record.record === "edge" && record.kind === "requires");
    expect(edge).toMatchObject({ statement: "Lemma 3.2", version: "3", relationOrdinal: 0 });

    writeDoc("claims/bound.md", "---\ntype: Reference\ntitle: B\nsummary: s\n---\nSee [l](./lemma.md).\n");
    const plainEdge = buildProjection({
      graph: graph(),
      tasks: [],
      sourceAdapterVersion: BACKLOG_SOURCE_ADAPTER_VERSION,
      docsRoot: "docs",
      okfVersion: "0.2",
      exporterVersion: "test",
      gitCommit: null,
      generatedAt: null,
    }).records.find((record) => record.record === "edge");
    // Absent, not null: a bundle using no relations must produce the byte-identical record stream —
    // and therefore the identical export digest — it produced before the qualifiers existed.
    expect(Object.keys(plainEdge ?? {})).not.toContain("statement");
    expect(Object.keys(plainEdge ?? {})).not.toContain("relationOrdinal");
  });
});

function relationEdge() {
  const edge = buildGraphExport(graph()).edges.find((candidate) => candidate.relationOrdinal !== undefined);
  if (edge === undefined) throw new Error("expected a relation edge");
  return edge;
}
