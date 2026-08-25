import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgent } from "../src/commands/agent";
import { loadBundle } from "../src/core/bundle";
import type { RetrievalGraphLoader } from "../src/core/retrieval";
import { LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_OUTPUT: OutputContext = { mode: "json", color: false };

type FacadeData = {
  selectedVersion: number;
  contextId: string;
  contextDigestSha256: string;
  request: { task: { id: string } };
  context: { profile: { name: string } };
  profileRevision: { path: string; sha256: string; mtimeMs: number };
  sources: unknown[];
  inputRevisions: unknown[];
};

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-context-facade-"));
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
    "# Checkout form\n\nUse accessible labels and checkout validation.\n\n## Errors\n\nKeep error focus deterministic.\n",
    "UI design",
  );
}

function retrieval(): RetrievalGraphLoader {
  const graph = loadBundle(join(root, "docs"));
  return async () => ({ graph, backend: "reference" });
}

describe("`lore agent context --contract opum-agent-workflow/v1` facade", () => {
  test("returns a validator-satisfying projection envelope bound to the task id", async () => {
    fixture();
    specialist();
    const stdout = capture();
    expect(
      await runAgent({
        root,
        output: JSON_OUTPUT,
        args: ["context", "frontend-dev", "--task", "T-42", "--contract", "opum-agent-workflow/v1"],
        stdout,
        retrieval: retrieval(),
      }),
    ).toBe(0);
    const envelope = JSON.parse(stdout.text()) as {
      schemaVersion: number;
      kind: string;
      data: Record<string, unknown>;
    };
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.kind).toBe("agent.workflow.projection");
    const data = envelope.data as FacadeData;
    expect(data.selectedVersion).toBe(1);
    // deterministic contextId
    expect(typeof data.contextId).toBe("string");
    // bare 64-hex sha256 digest
    expect(data.contextDigestSha256).toMatch(/^[0-9a-f]{64}$/);
    // exact task/profile/profileRevision binding
    expect(data.request.task.id).toBe("T-42");
    expect(data.context.profile.name).toBe("frontend-dev");
    expect(data.profileRevision.path).toBe(".lore/agents/frontend-dev.toml");
    expect(data.profileRevision.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    // source IDs and freshness
    expect(Array.isArray(data.sources)).toBe(true);
    expect(data.sources.length).toBeGreaterThan(0);
    expect(typeof data.profileRevision.mtimeMs).toBe("number");
    expect(Array.isArray(data.inputRevisions)).toBe(true);
  });

  test("is deterministic in contextId and digest across runs", async () => {
    fixture();
    specialist();
    const run = async () => {
      const stdout = capture();
      await runAgent({
        root,
        output: JSON_OUTPUT,
        args: ["context", "frontend-dev", "--task", "T-7", "--contract", "opum-agent-workflow/v1"],
        stdout,
        retrieval: retrieval(),
      });
      return JSON.parse(stdout.text()).data as FacadeData;
    };
    const one = await run();
    const two = await run();
    expect(one.contextId).toBe(two.contextId);
    expect(one.contextDigestSha256).toBe(two.contextDigestSha256);
  });

  test("rejects unknown contracts with stable usage diagnostics", async () => {
    fixture();
    specialist();
    let threw: unknown;
    try {
      await runAgent({
        root,
        output: JSON_OUTPUT,
        args: ["context", "frontend-dev", "--task", "T-1", "--contract", "other/v2"],
        stdout: capture(),
        retrieval: retrieval(),
      });
    } catch (error) {
      threw = error;
    }
    expect(threw).toBeInstanceOf(LoreError);
    expect((threw as LoreError).type).toBe("usage");
    expect((threw as LoreError).message).toContain('unsupported contract "other/v2"');
  });

  test("default context behavior stays byte-compatible without --contract", async () => {
    fixture();
    specialist();
    const stdout = capture();
    expect(
      await runAgent({
        root,
        output: JSON_OUTPUT,
        args: ["context", "frontend-dev", "--task", "checkout errors"],
        stdout,
        retrieval: retrieval(),
      }),
    ).toBe(0);
    const envelope = JSON.parse(stdout.text());
    expect(envelope.kind).toBe("agent.context.export");
  });
});
