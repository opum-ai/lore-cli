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

type BindingRecord = {
  contract: string;
  selectedVersion: number;
  requestId: string;
  taskId: string;
  profileId: string;
  profileRevision: string;
  digestAlgorithm: string;
  digest: string;
  contextId: string;
  issuedAt: string;
  expiresAt: string;
  sourceIds: string[];
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

/** Run the binding seam in-process with the binding delivered via --request. */
async function runBinding(
  overrides: Record<string, unknown> = {},
  task?: string,
): Promise<{ code: number; stdout: string }> {
  const binding = {
    contract: "opum-agent-workflow",
    supportedVersions: [1],
    requestId: "a".repeat(32),
    taskId: "T-42",
    profileId: "frontend-dev",
    ...overrides,
  };
  writeFileSync(join(root, "binding.json"), `${JSON.stringify(binding)}\n`);
  const stdout = capture();
  const args = ["context", "frontend-dev", "--request", "binding.json", "--contract", "opum-agent-workflow/v1"];
  if (task !== undefined) args.splice(2, 0, "--task", task);
  const code = await runAgent({ root, output: JSON_OUTPUT, args, stdout, retrieval: retrieval() });
  return { code, stdout: stdout.text() };
}

describe("`lore agent context --contract opum-agent-workflow/v1` binding seam", () => {
  test("returns the bare facade record bound to the exact request", async () => {
    fixture();
    specialist();
    const { code, stdout } = await runBinding();
    expect(code).toBe(0);
    const lines = stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0] ?? "{}") as BindingRecord;
    expect(record.contract).toBe("opum-agent-workflow");
    expect(record.selectedVersion).toBe(1);
    expect(record.requestId).toBe("a".repeat(32));
    expect(record.taskId).toBe("T-42");
    expect(record.profileId).toBe("frontend-dev");
    expect(record.digestAlgorithm).toBe("sha256");
    expect(record.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof record.contextId).toBe("string");
    expect(record.profileRevision).toMatch(/^[0-9a-f]{64}$/);
    expect(Array.isArray(record.sourceIds)).toBe(true);
    expect(record.sourceIds.length).toBeGreaterThan(0);
    const issued = Date.parse(record.issuedAt);
    const expires = Date.parse(record.expiresAt);
    expect(expires - issued).toBeGreaterThan(0);
    expect(expires - issued).toBeLessThanOrEqual(300_000);
  });

  test("is deterministic in contextId and digest across runs", async () => {
    fixture();
    specialist();
    const run = async (): Promise<{ contextId: string; digest: string }> => {
      const { stdout } = await runBinding({ taskId: "T-7" }, "T-7");
      const record = JSON.parse(stdout.trim()) as BindingRecord;
      return { contextId: record.contextId, digest: record.digest };
    };
    const one = await run();
    const two = await run();
    expect(one.contextId).toBe(two.contextId);
    expect(one.digest).toBe(two.digest);
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
