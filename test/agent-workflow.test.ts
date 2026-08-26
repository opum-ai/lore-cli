import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/commands/agent";
import { loadAgentProfiles } from "../src/core/agent-profile";
import {
  compileAgentWorkflowProjection,
  parseWorkflowRequest,
  WORKFLOW_CONTRACT,
  WORKFLOW_VERSION,
} from "../src/core/agent-workflow";
import { loadBundle } from "../src/core/bundle";
import type { RetrievalGraphLoader } from "../src/core/retrieval";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, expectError } from "./helpers";

const JSON_OUTPUT: OutputContext = { mode: "json", color: false };
const PLAIN_OUTPUT: OutputContext = { mode: "plain", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-agent-workflow-"));
  mkdirSync(join(root, "docs"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function doc(rel: string, body: string, title = rel): void {
  const path = join(root, "docs", rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    `---\ntype: Reference\ntitle: ${title}\nsummary: Summary for ${title}.\ntags: [evidence]\n---\n${body}`,
  );
}

function specialist(name = "frontend-dev"): void {
  const path = join(root, ".lore/agents", `${name}.toml`);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    `schema_version = 1\nname = "${name}"\ndescription = "Frontend implementation context."\nkind = "specialist"\nmax_tokens = 1200\npinned = ["reference/rules#must-follow"]\nsources = ["specs/ui"]\n`,
  );
}

function fixture(): void {
  doc("reference/rules.md", "# Must follow\n\nNever expose credentials.\n\n# Other\n\nUnrelated.\n", "Rules");
  doc(
    "specs/ui.md",
    "# Checkout form\n\nUse accessible labels and checkout validation.\n\n## Errors\n\nKeep error focus deterministic.\n\n# Backend\n\nUnrelated storage text.\n",
    "UI design",
  );
}

function retrieval(): RetrievalGraphLoader {
  const graph = loadBundle(join(root, "docs"));
  return async () => ({ graph, backend: "reference" });
}

function requestEnvelope(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    contract: WORKFLOW_CONTRACT,
    version: WORKFLOW_VERSION,
    task: { id: "T-1", text: "checkout form errors" },
    ...extra,
  });
}

function treeDigest(dir: string): string {
  const hash = createHash("sha256");
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) hash.update(treeDigest(path));
    else {
      hash.update(entry.name);
      hash.update(String(statSync(path).mtimeMs));
    }
  }
  return hash.digest("hex");
}

describe("workflow request envelope parsing", () => {
  test("accepts the canonical envelope and defaults contract/version", () => {
    const request = parseWorkflowRequest('{"task":{"id":"T-9","text":"ship it"}}');
    expect(request.task).toEqual({ id: "T-9", text: "ship it" });
  });

  test("rejects malformed envelopes with stable validation diagnostics", () => {
    expectError("validation", () => parseWorkflowRequest("{not json"));
    expectError("validation", () => parseWorkflowRequest("[1,2]"));
    expectError("validation", () => parseWorkflowRequest('{"task":{"id":"T","text":"x"},"extra":1}'));
    expectError("validation", () => parseWorkflowRequest('{"task":{"text":"no id"}}'));
    expectError("validation", () => parseWorkflowRequest('{"task":{"id":"T","text":"  "}}'));
    expectError("validation", () => parseWorkflowRequest(requestEnvelope({ version: "v2" })));
    expectError("validation", () => parseWorkflowRequest(requestEnvelope({ contract: "other-workflow" })));
    expectError("validation", () => parseWorkflowRequest(requestEnvelope({ expect: { contextDigest: "" } })));
  });
});

describe("agent workflow projection (opum-agent-workflow/v1)", () => {
  test("binds task identity and reuses packDigest as contextDigest evidence", async () => {
    fixture();
    specialist();
    const stdout = capture();
    const args = ["project", "frontend-dev", "--request", "request.json"];
    writeFileSync(join(root, "request.json"), requestEnvelope());
    expect(await runAgent({ root, output: JSON_OUTPUT, args, stdout, retrieval: retrieval() })).toBe(0);
    const envelope = JSON.parse(stdout.text()) as {
      kind: string;
      schemaVersion: number;
      data: Record<string, unknown>;
    };
    expect(envelope.kind).toBe("agent.workflow.projection");
    expect(envelope.schemaVersion).toBe(1);
    const data = envelope.data as {
      contract: string;
      version: string;
      request: { task: { id: string; text: string } };
      contextDigest: string;
      packDigest: string;
      sources: readonly string[];
      profileRevision: { path: string; sha256: string };
      inputRevisions: readonly { path: string; sha256: string }[];
      context: { packDigest: string; task: string; profile: { name: string } };
    };
    expect(data.contract).toBe("opum-agent-workflow");
    expect(data.version).toBe("v1");
    expect(data.request.task).toEqual({ id: "T-1", text: "checkout form errors" });
    expect(data.contextDigest).toBe(data.context.packDigest);
    expect(data.packDigest).toBe(data.context.packDigest);
    expect(data.context.profile.name).toBe("frontend-dev");
    expect(data.sources.length).toBeGreaterThan(0);
    expect(data.profileRevision.path).toBe(".lore/agents/frontend-dev.toml");
    expect(data.inputRevisions.every((revision) => revision.path.startsWith("docs/"))).toBe(true);
  });

  test("is deterministic across runs apart from freshness fields", async () => {
    fixture();
    specialist();
    writeFileSync(join(root, "request.json"), requestEnvelope());
    const snapshot = loadAgentProfiles(root);
    const graph = loadBundle(join(root, "docs"));
    const request = parseWorkflowRequest(requestEnvelope());
    const one = compileAgentWorkflowProjection(snapshot, graph, "frontend-dev", request, { root });
    const two = compileAgentWorkflowProjection(snapshot, graph, "frontend-dev", request, { root });
    const strip = (projection: typeof one) =>
      JSON.stringify({ ...projection, profileRevision: undefined, inputRevisions: undefined });
    expect(strip(one)).toBe(strip(two));
  });

  test("a stale pinned digest conflicts while a fresh pin passes", async () => {
    fixture();
    specialist();
    const snapshot = loadAgentProfiles(root);
    const graph = loadBundle(join(root, "docs"));
    const request = parseWorkflowRequest(requestEnvelope());
    const projection = compileAgentWorkflowProjection(snapshot, graph, "frontend-dev", request, { root });
    const stale = parseWorkflowRequest(
      requestEnvelope({
        expect: { contextDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
      }),
    );
    const conflict = expectError("conflict", () =>
      compileAgentWorkflowProjection(snapshot, graph, "frontend-dev", stale, { root }),
    );
    expect(conflict.input).toMatchObject({ actual: projection.packDigest });
    const fresh = parseWorkflowRequest(requestEnvelope({ expect: { contextDigest: projection.packDigest } }));
    expect(compileAgentWorkflowProjection(snapshot, graph, "frontend-dev", fresh, { root }).contextDigest).toBe(
      projection.packDigest,
    );
  });

  test("unknown profiles stay not_found and the projection is read-only", async () => {
    fixture();
    specialist();
    writeFileSync(join(root, "request.json"), requestEnvelope());
    const before = treeDigest(root);
    const stdout = capture();
    expect(
      await runAgent({
        root,
        output: JSON_OUTPUT,
        args: ["project", "frontend-dev", "--request", "request.json"],
        stdout,
        retrieval: retrieval(),
      }),
    ).toBe(0);
    expect(treeDigest(root)).toBe(before);
    let threw: unknown;
    try {
      await runAgent({
        root,
        output: JSON_OUTPUT,
        args: ["project", "missing", "--request", "-"],
        stdout: capture(),
        retrieval: retrieval(),
      });
    } catch (error) {
      threw = error;
    }
    expect(threw).toBeInstanceOf(LoreError);
    expect((threw as LoreError).type).toBe("not_found");
    expect(treeDigest(root)).toBe(before);
  });

  test("plain output is ANSI-free and carries the digest header", async () => {
    fixture();
    specialist();
    writeFileSync(join(root, "request.json"), requestEnvelope());
    const stdout = capture();
    expect(
      await runAgent({
        root,
        output: PLAIN_OUTPUT,
        args: ["project", "frontend-dev", "--request", "request.json"],
        stdout,
        retrieval: retrieval(),
      }),
    ).toBe(0);
    expect(stdout.text()).toContain("opum-agent-workflow/v1 — task T-1");
    expect(stdout.text()).not.toContain("\u001b[");
  });
});
